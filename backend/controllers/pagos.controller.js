const db = require('../config/db');

// Historial de pagos de un cliente (vista mes a mes)
async function historialCliente(req, res) {
  const { clienteId } = req.params;
  const r = await db.query(
    `SELECT * FROM pagos WHERE cliente_id = $1 ORDER BY periodo DESC`,
    [clienteId]
  );
  res.json(r.rows);
}

// Lista de pagos con filtros (por periodo, por cliente, etc.) — útil para reportes
async function listarPagos(req, res) {
  const { desde, hasta, clienteId } = req.query;
  let sql = `
    SELECT p.*, c.cliente_id AS folio, c.nombre AS cliente_nombre
    FROM pagos p JOIN clientes c ON c.id = p.cliente_id
    WHERE 1=1`;
  const params = [];

  if (desde) { params.push(desde); sql += ` AND p.periodo >= $${params.length}`; }
  if (hasta) { params.push(hasta); sql += ` AND p.periodo <= $${params.length}`; }
  if (clienteId) { params.push(clienteId); sql += ` AND p.cliente_id = $${params.length}`; }

  sql += ' ORDER BY p.fecha_pago DESC';
  const r = await db.query(sql, params);
  res.json(r.rows);
}

// Registrar un pago. Si meses_cubiertos > 1 (excepción autorizada, máx. 3),
// se generan varias filas -- una por cada mes cubierto -- ligadas por el mismo grupo_pago.
async function registrarPago(req, res) {
  const { cliente_id, periodo, monto, metodo_pago, meses_cubiertos, notas, fecha_pago } = req.body;

  if (!cliente_id || !periodo || monto === undefined) {
    return res.status(400).json({ error: 'Cliente, periodo (mes) y monto son obligatorios.' });
  }

  const meses = Math.min(Math.max(parseInt(meses_cubiertos || 1, 10), 1), 3);
  const esExcepcion = meses > 1;

  // monto por mes: si pagó varios meses de una exhibición, se reparte el monto entre los periodos
  const montoPorMes = (Number(monto) / meses).toFixed(2);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const grupoResult = await client.query('SELECT gen_random_uuid() AS id');
    const grupoPago = grupoResult.rows[0].id;

    const filasInsertadas = [];
    const periodoBase = new Date(periodo + '-01T00:00:00');

    for (let i = 0; i < meses; i++) {
      const fechaPeriodo = new Date(periodoBase);
      fechaPeriodo.setMonth(fechaPeriodo.getMonth() + i);
      const periodoStr = fechaPeriodo.toISOString().slice(0, 10);

      const r = await client.query(
        `INSERT INTO pagos
          (grupo_pago, cliente_id, periodo, monto, fecha_pago, metodo_pago, meses_cubiertos, es_excepcion, registrado_por, notas)
         VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6,$7,$8,$9,$10)
         RETURNING *`,
        [grupoPago, cliente_id, periodoStr, montoPorMes, fecha_pago, metodo_pago || 'efectivo', meses, esExcepcion, req.usuario?.id || null, notas]
      );
      filasInsertadas.push(r.rows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({ mensaje: `Pago registrado (${meses} mes(es) cubierto(s)).`, pagos: filasInsertadas });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un pago registrado para ese cliente en ese mes.' });
    }
    res.status(500).json({ error: 'No se pudo registrar el pago.' });
  } finally {
    client.release();
  }
}

async function eliminarPago(req, res) {
  const { id } = req.params;
  const r = await db.query('DELETE FROM pagos WHERE id = $1 RETURNING *', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Pago no encontrado.' });
  res.json({ mensaje: 'Pago eliminado.', pago: r.rows[0] });
}

module.exports = { historialCliente, listarPagos, registrarPago, eliminarPago };
