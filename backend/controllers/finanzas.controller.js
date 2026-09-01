const db = require('../config/db');

// Resumen mensual: ingresos (suma de pagos) vs egresos, últimos N meses
async function resumenMensual(req, res) {
  const meses = parseInt(req.query.meses || '6', 10);

  const ingresos = await db.query(
    `SELECT to_char(periodo, 'YYYY-MM') AS mes, SUM(monto)::numeric(12,2) AS total
     FROM pagos
     WHERE periodo >= date_trunc('month', CURRENT_DATE) - ($1 || ' months')::interval
     GROUP BY mes ORDER BY mes`,
    [meses]
  );

  const egresos = await db.query(
    `SELECT to_char(fecha, 'YYYY-MM') AS mes, SUM(monto)::numeric(12,2) AS total
     FROM egresos
     WHERE fecha >= date_trunc('month', CURRENT_DATE) - ($1 || ' months')::interval
     GROUP BY mes ORDER BY mes`,
    [meses]
  );

  res.json({ ingresos: ingresos.rows, egresos: egresos.rows });
}

// Totales del mes en curso, para las tarjetas del dashboard
async function resumenMesActual(req, res) {
  const ingresos = await db.query(
    `SELECT COALESCE(SUM(monto),0)::numeric(12,2) AS total FROM pagos
     WHERE periodo = date_trunc('month', CURRENT_DATE)::date`
  );
  const egresos = await db.query(
    `SELECT COALESCE(SUM(monto),0)::numeric(12,2) AS total FROM egresos
     WHERE date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE)`
  );
  const clientesActivos = await db.query(`SELECT COUNT(*)::int AS total FROM clientes WHERE estado = 'activo'`);

  const totalIngresos = Number(ingresos.rows[0].total);
  const totalEgresos = Number(egresos.rows[0].total);

  res.json({
    ingresos: totalIngresos,
    egresos: totalEgresos,
    balance: Number((totalIngresos - totalEgresos).toFixed(2)),
    clientes_activos: clientesActivos.rows[0].total
  });
}

async function egresosPorCategoria(req, res) {
  const r = await db.query(
    `SELECT cat.nombre AS categoria, COALESCE(SUM(e.monto),0)::numeric(12,2) AS total
     FROM egresos_categorias cat
     LEFT JOIN egresos e ON e.categoria_id = cat.id
       AND date_trunc('month', e.fecha) = date_trunc('month', CURRENT_DATE)
     GROUP BY cat.nombre ORDER BY total DESC`
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
  sql += ' ORDER BY e.fecha DESC';
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

async function eliminarEgreso(req, res) {
  const { id } = req.params;
  const r = await db.query('DELETE FROM egresos WHERE id = $1 RETURNING *', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Egreso no encontrado.' });
  res.json({ mensaje: 'Egreso eliminado.' });
}

module.exports = {
  resumenMensual, resumenMesActual, egresosPorCategoria,
  listarEgresos, crearEgreso, eliminarEgreso
};
