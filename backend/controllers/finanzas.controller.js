const db = require('../config/db');

// Lee el parámetro ?mes=YYYY-MM (opcional). Si no viene o es inválido, devuelve null
// y las consultas usan el mes en curso.
function mesParam(req) {
  const m = String(req.query.mes || '');
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? `${m}-01` : null;
}

// Resumen mensual: ingresos (pagos + ingresos extra) vs egresos, N meses que TERMINAN
// en el mes elegido (?mes=YYYY-MM) o en el mes en curso si no se manda.
async function resumenMensual(req, res) {
  const meses = Math.min(Math.max(parseInt(req.query.meses || '6', 10) || 6, 1), 24);
  const base = mesParam(req);

  const ingresos = await db.query(
    `SELECT mes, SUM(total)::numeric(12,2) AS total FROM (
       SELECT to_char(periodo, 'YYYY-MM') AS mes, monto AS total FROM pagos
       WHERE periodo >= date_trunc('month', COALESCE($2::date, CURRENT_DATE)) - make_interval(months => $1::int - 1)
         AND periodo < date_trunc('month', COALESCE($2::date, CURRENT_DATE)) + interval '1 month'
       UNION ALL
       SELECT to_char(fecha, 'YYYY-MM') AS mes, monto AS total FROM ingresos_extra
       WHERE fecha >= date_trunc('month', COALESCE($2::date, CURRENT_DATE)) - make_interval(months => $1::int - 1)
         AND fecha < date_trunc('month', COALESCE($2::date, CURRENT_DATE)) + interval '1 month'
     ) combinado
     GROUP BY mes ORDER BY mes`,
    [meses, base]
  );

  const egresos = await db.query(
    `SELECT to_char(fecha, 'YYYY-MM') AS mes, SUM(monto)::numeric(12,2) AS total
     FROM egresos
     WHERE fecha >= date_trunc('month', COALESCE($2::date, CURRENT_DATE)) - make_interval(months => $1::int - 1)
       AND fecha < date_trunc('month', COALESCE($2::date, CURRENT_DATE)) + interval '1 month'
     GROUP BY mes ORDER BY mes`,
    [meses, base]
  );

  res.json({ ingresos: ingresos.rows, egresos: egresos.rows });
}

// Totales de un mes (?mes=YYYY-MM, por defecto el mes en curso), para las tarjetas
async function resumenMesActual(req, res) {
  const base = mesParam(req);

  const pagosRes = await db.query(
    `SELECT COALESCE(SUM(monto),0)::numeric(12,2) AS total FROM pagos
     WHERE periodo = date_trunc('month', COALESCE($1::date, CURRENT_DATE))::date`,
    [base]
  );
  const extraRes = await db.query(
    `SELECT COALESCE(SUM(monto),0)::numeric(12,2) AS total FROM ingresos_extra
     WHERE date_trunc('month', fecha) = date_trunc('month', COALESCE($1::date, CURRENT_DATE))`,
    [base]
  );
  const egresos = await db.query(
    `SELECT COALESCE(SUM(monto),0)::numeric(12,2) AS total FROM egresos
     WHERE date_trunc('month', fecha) = date_trunc('month', COALESCE($1::date, CURRENT_DATE))`,
    [base]
  );
  const clientesActivos = await db.query(`SELECT COUNT(*)::int AS total FROM clientes WHERE estado = 'activo'`);

  const totalPagos = Number(pagosRes.rows[0].total);
  const totalExtra = Number(extraRes.rows[0].total);
  const totalIngresos = totalPagos + totalExtra;
  const totalEgresos = Number(egresos.rows[0].total);

  res.json({
    ingresos: totalIngresos,
    ingresos_mensualidades: totalPagos,
    ingresos_extra: totalExtra,
    egresos: totalEgresos,
    balance: Number((totalIngresos - totalEgresos).toFixed(2)),
    clientes_activos: clientesActivos.rows[0].total
  });
}

async function egresosPorCategoria(req, res) {
  const base = mesParam(req);
  const r = await db.query(
    `SELECT cat.nombre AS categoria, COALESCE(SUM(e.monto),0)::numeric(12,2) AS total
     FROM egresos_categorias cat
     LEFT JOIN egresos e ON e.categoria_id = cat.id
       AND date_trunc('month', e.fecha) = date_trunc('month', COALESCE($1::date, CURRENT_DATE))
     GROUP BY cat.nombre ORDER BY total DESC`,
    [base]
  );
  res.json(r.rows);
}

// ---------- CRUD de egresos ----------
async function listarEgresos(req, res) {
  const { desde, hasta } = req.query;
  let sql = `SELECT e.*, c.nombre AS categoria_nombre FROM egresos e
             LEFT JOIN egresos_categorias c ON c.id = e.categoria_id WHERE 1=1`;
  const params = [];
  if (desde) { params.push(desde); sql += ` AND e.fecha >= $${params.length}`; }
  if (hasta) { params.push(hasta); sql += ` AND e.fecha <= $${params.length}`; }
  const base = mesParam(req);
  if (base) { params.push(base); sql += ` AND date_trunc('month', e.fecha) = date_trunc('month', $${params.length}::date)`; }
  sql += ' ORDER BY e.creado_en DESC, e.id DESC';
  const r = await db.query(sql, params);
  res.json(r.rows);
}

async function crearEgreso(req, res) {
  const { categoria_id, concepto, monto, fecha, notas } = req.body;
  if (!concepto || monto === undefined) {
    return res.status(400).json({ error: 'Concepto y monto son obligatorios.' });
  }
  const evidencia_url = req.file ? `/uploads/evidencias/${req.file.filename}` : null;
  const r = await db.query(
    `INSERT INTO egresos (categoria_id, concepto, monto, fecha, comprobante_url, registrado_por, notas)
     VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6,$7) RETURNING *`,
    [categoria_id || null, concepto, monto, fecha, evidencia_url, req.usuario?.id || null, notas]
  );
  res.status(201).json(r.rows[0]);
}

async function actualizarEgreso(req, res) {
  const { id } = req.params;
  const { categoria_id, concepto, monto, fecha, notas } = req.body;
  if (!concepto || monto === undefined) {
    return res.status(400).json({ error: 'Concepto y monto son obligatorios.' });
  }

  const sets = ['categoria_id = $1', 'concepto = $2', 'monto = $3', 'fecha = $4', 'notas = $5'];
  const params = [categoria_id || null, concepto, monto, fecha, notas];

  if (req.file) {
    params.push(`/uploads/evidencias/${req.file.filename}`);
    sets.push(`comprobante_url = $${params.length}`);
  }

  params.push(id);
  const r = await db.query(`UPDATE egresos SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!r.rows[0]) return res.status(404).json({ error: 'Egreso no encontrado.' });
  res.json(r.rows[0]);
}

async function eliminarEgreso(req, res) {
  const { id } = req.params;
  const r = await db.query('DELETE FROM egresos WHERE id = $1 RETURNING *', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Egreso no encontrado.' });
  res.json({ mensaje: 'Egreso eliminado.' });
}

// ---------- CRUD de ingresos extra (cobros únicos: instalación, reconexión, etc.) ----------
async function listarIngresosExtra(req, res) {
  const { desde, hasta } = req.query;
  let sql = `SELECT i.*, c.nombre AS categoria_nombre, cl.cliente_id AS cliente_folio, cl.nombre AS cliente_nombre
             FROM ingresos_extra i
             LEFT JOIN ingresos_categorias c ON c.id = i.categoria_id
             LEFT JOIN clientes cl ON cl.id = i.cliente_id
             WHERE 1=1`;
  const params = [];
  if (desde) { params.push(desde); sql += ` AND i.fecha >= $${params.length}`; }
  if (hasta) { params.push(hasta); sql += ` AND i.fecha <= $${params.length}`; }
  const base = mesParam(req);
  if (base) { params.push(base); sql += ` AND date_trunc('month', i.fecha) = date_trunc('month', $${params.length}::date)`; }
  sql += ' ORDER BY i.creado_en DESC, i.id DESC';
  const r = await db.query(sql, params);
  res.json(r.rows);
}

async function crearIngresoExtra(req, res) {
  const { categoria_id, concepto, monto, fecha, cliente_folio, notas } = req.body;
  if (!concepto || monto === undefined) {
    return res.status(400).json({ error: 'Concepto y monto son obligatorios.' });
  }

  let clienteId = null;
  if (cliente_folio && cliente_folio.trim()) {
    const clienteRes = await db.query('SELECT id FROM clientes WHERE UPPER(cliente_id) = UPPER($1)', [cliente_folio.trim()]);
    if (!clienteRes.rows[0]) {
      return res.status(400).json({ error: `No existe ningún cliente con el folio "${cliente_folio}".` });
    }
    clienteId = clienteRes.rows[0].id;
  }

  const comprobante_url = req.file ? `/uploads/evidencias/${req.file.filename}` : null;
  const r = await db.query(
    `INSERT INTO ingresos_extra (categoria_id, concepto, monto, fecha, cliente_id, comprobante_url, registrado_por, notas)
     VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6,$7,$8) RETURNING *`,
    [categoria_id || null, concepto, monto, fecha, clienteId, comprobante_url, req.usuario?.id || null, notas]
  );
  res.status(201).json(r.rows[0]);
}

async function actualizarIngresoExtra(req, res) {
  const { id } = req.params;
  const { categoria_id, concepto, monto, fecha, cliente_folio, notas } = req.body;
  if (!concepto || monto === undefined) {
    return res.status(400).json({ error: 'Concepto y monto son obligatorios.' });
  }

  let clienteId;
  if (cliente_folio !== undefined) {
    if (cliente_folio && cliente_folio.trim()) {
      const clienteRes = await db.query('SELECT id FROM clientes WHERE UPPER(cliente_id) = UPPER($1)', [cliente_folio.trim()]);
      if (!clienteRes.rows[0]) {
        return res.status(400).json({ error: `No existe ningún cliente con el folio "${cliente_folio}".` });
      }
      clienteId = clienteRes.rows[0].id;
    } else {
      clienteId = null; // se dejó vacío el campo de cliente a propósito
    }
  }

  const sets = ['categoria_id = $1', 'concepto = $2', 'monto = $3', 'fecha = $4', 'notas = $5'];
  const params = [categoria_id || null, concepto, monto, fecha, notas];

  if (clienteId !== undefined) {
    params.push(clienteId);
    sets.push(`cliente_id = $${params.length}`);
  }
  if (req.file) {
    params.push(`/uploads/evidencias/${req.file.filename}`);
    sets.push(`comprobante_url = $${params.length}`);
  }

  params.push(id);
  const r = await db.query(`UPDATE ingresos_extra SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!r.rows[0]) return res.status(404).json({ error: 'Registro no encontrado.' });
  res.json(r.rows[0]);
}

async function eliminarIngresoExtra(req, res) {
  const { id } = req.params;
  const r = await db.query('DELETE FROM ingresos_extra WHERE id = $1 RETURNING *', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Registro no encontrado.' });
  res.json({ mensaje: 'Ingreso eliminado.' });
}

module.exports = {
  resumenMensual, resumenMesActual, egresosPorCategoria,
  listarEgresos, crearEgreso, actualizarEgreso, eliminarEgreso,
  listarIngresosExtra, crearIngresoExtra, actualizarIngresoExtra, eliminarIngresoExtra
};
