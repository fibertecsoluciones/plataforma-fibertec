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
  // Los egresos sin categoría también cuentan: sin esto, las porciones no sumaban lo mismo que el total.
  const sin = await db.query(
    `SELECT COALESCE(SUM(monto),0)::numeric(12,2) AS total FROM egresos
     WHERE categoria_id IS NULL
       AND date_trunc('month', fecha) = date_trunc('month', COALESCE($1::date, CURRENT_DATE))`,
    [base]
  );
  const filas = r.rows;
  if (Number(sin.rows[0].total) > 0) {
    filas.push({ categoria: 'Sin categoría', total: sin.rows[0].total });
    filas.sort((a, b) => Number(b.total) - Number(a.total));
  }
  res.json(filas);
}

// Desglose del mes: de qué está hecho cada total (ingresos por rubro y egresos por categoría).
// Usa exactamente el mismo criterio de mes que resumenMesActual, para que los números cuadren:
//   · mensualidades → por el mes que cubren (pagos.periodo)
//   · ingresos extra y egresos → por su fecha
async function desgloseMes(req, res) {
  const base = mesParam(req);

  const mens = await db.query(
    `SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(monto),0)::numeric(12,2) AS total
     FROM pagos WHERE periodo = date_trunc('month', COALESCE($1::date, CURRENT_DATE))::date`,
    [base]
  );
  const extras = await db.query(
    `SELECT COALESCE(c.nombre, 'Sin categoría') AS concepto, COUNT(*)::int AS cantidad, SUM(i.monto)::numeric(12,2) AS total
     FROM ingresos_extra i
     LEFT JOIN ingresos_categorias c ON c.id = i.categoria_id
     WHERE date_trunc('month', i.fecha) = date_trunc('month', COALESCE($1::date, CURRENT_DATE))
     GROUP BY COALESCE(c.nombre, 'Sin categoría')
     ORDER BY total DESC`,
    [base]
  );
  const egresos = await db.query(
    `SELECT COALESCE(c.nombre, 'Sin categoría') AS concepto, COUNT(*)::int AS cantidad, SUM(e.monto)::numeric(12,2) AS total
     FROM egresos e
     LEFT JOIN egresos_categorias c ON c.id = e.categoria_id
     WHERE date_trunc('month', e.fecha) = date_trunc('month', COALESCE($1::date, CURRENT_DATE))
     GROUP BY COALESCE(c.nombre, 'Sin categoría')
     ORDER BY total DESC`,
    [base]
  );

  const ingresos = [
    { clave: 'mensualidades', concepto: 'Mensualidades de clientes', cantidad: mens.rows[0].cantidad, total: Number(mens.rows[0].total) },
    ...extras.rows.map(r => ({ clave: `extra:${r.concepto}`, concepto: r.concepto, cantidad: r.cantidad, total: Number(r.total) }))
  ];
  const egresosLista = egresos.rows.map(r => ({ concepto: r.concepto, cantidad: r.cantidad, total: Number(r.total) }));

  const totalIngresos = Number(ingresos.reduce((a, r) => a + r.total, 0).toFixed(2));
  const totalEgresos = Number(egresosLista.reduce((a, r) => a + r.total, 0).toFixed(2));

  res.json({
    ingresos, egresos: egresosLista,
    total_ingresos: totalIngresos, total_egresos: totalEgresos,
    balance: Number((totalIngresos - totalEgresos).toFixed(2))
  });
}

// Cada ingreso del mes, uno por uno: las mensualidades de los clientes + los ingresos extra
// (instalación, reconexión, venta de equipo…) en una sola lista, con su cliente y su fecha.
async function ingresosDetalle(req, res) {
  const base = mesParam(req);
  const r = await db.query(
    `SELECT 'mensualidad'::text AS tipo, 'Mensualidad'::text AS categoria, p.id, p.monto,
            p.fecha_pago AS fecha, p.periodo, p.metodo_pago::text AS metodo_pago,
            c.id AS cliente_pk, c.cliente_id AS cliente_folio, c.nombre AS cliente_nombre,
            p.es_excepcion, p.meses_cubiertos::int AS meses_cubiertos,
            NULL::text AS concepto, p.notas, p.creado_en
     FROM pagos p
     JOIN clientes c ON c.id = p.cliente_id
     WHERE p.periodo = date_trunc('month', COALESCE($1::date, CURRENT_DATE))::date
     UNION ALL
     SELECT 'extra'::text, COALESCE(cat.nombre, 'Sin categoría')::text, i.id, i.monto,
            i.fecha, NULL::date, NULL::text,
            cl.id, cl.cliente_id, cl.nombre,
            FALSE, NULL::int,
            i.concepto::text, i.notas, i.creado_en
     FROM ingresos_extra i
     LEFT JOIN ingresos_categorias cat ON cat.id = i.categoria_id
     LEFT JOIN clientes cl ON cl.id = i.cliente_id
     WHERE date_trunc('month', i.fecha) = date_trunc('month', COALESCE($1::date, CURRENT_DATE))
     ORDER BY fecha DESC, creado_en DESC, id DESC`,
    [base]
  );
  res.json(r.rows);
}

// ---------- CRUD de egresos ----------
// Los egresos que nacen de "Pago a técnicos" (uno por cada abono) se gestionan desde ese módulo, para que el
// pago y el egreso nunca queden desajustados. Si la tabla aún no existe (migración sin correr), se trata como "no ligado".
async function pagoTecnicoLigado(egresoId) {
  try {
    const r = await db.query('SELECT id, monto, fecha AS fecha_pago FROM pagos_tecnicos_abonos WHERE egreso_id = $1', [egresoId]);
    return r.rows[0] || null;
  } catch (err) {
    if (err.code === '42P01') return null;
    throw err;
  }
}

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

  // Marca los egresos que vienen de un pago a técnicos
  let ligados = new Set();
  if (r.rows.length) {
    try {
      const l = await db.query('SELECT egreso_id FROM pagos_tecnicos_abonos WHERE egreso_id = ANY($1::int[])', [r.rows.map(e => e.id)]);
      ligados = new Set(l.rows.map(x => x.egreso_id));
    } catch (err) { if (err.code !== '42P01') throw err; }
  }
  res.json(r.rows.map(e => ({ ...e, es_pago_tecnico: ligados.has(e.id) })));
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

  const ligado = await pagoTecnicoLigado(id);
  if (ligado) {
    const mismoMonto = Number(monto) === Number(ligado.monto);
    const mismaFecha = !fecha || String(fecha).slice(0, 10) === new Date(ligado.fecha_pago).toISOString().slice(0, 10);
    if (!mismoMonto || !mismaFecha) {
      return res.status(409).json({ error: 'Este egreso viene de un pago a técnicos: el monto y la fecha se cambian desde "Pago a técnicos" (deshaz ese abono y vuelve a registrarlo).' });
    }
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
  if (await pagoTecnicoLigado(id)) {
    return res.status(409).json({ error: 'Este egreso viene de un pago a técnicos. Para quitarlo deshaz ese abono en la sección Pago a técnicos.' });
  }
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
  resumenMensual, resumenMesActual, egresosPorCategoria, desgloseMes, ingresosDetalle,
  listarEgresos, crearEgreso, actualizarEgreso, eliminarEgreso,
  listarIngresosExtra, crearIngresoExtra, actualizarIngresoExtra, eliminarIngresoExtra
};
