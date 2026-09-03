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

// Desglose mes a mes de un cliente: cuánto se esperaba, cuánto pagó (sumando todos
// sus abonos de ese mes) y cuánto le falta. Así se ve EXACTAMENTE a qué mes
// corresponde cualquier saldo pendiente, en vez de solo un número suelto.
async function desgloseCliente(req, res) {
  const { clienteId } = req.params;

  const clienteRes = await db.query(
    `SELECT c.fecha_alta, c.fecha_inicio_conteo, c.dia_pago, c.dias_tolerancia, p.precio
     FROM clientes c JOIN planes p ON p.id = c.plan_id WHERE c.id = $1`,
    [clienteId]
  );
  const cliente = clienteRes.rows[0];
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });

  const precio = Number(cliente.precio);
  const diaPago = Number(cliente.dia_pago);
  const diasTolerancia = Number(cliente.dias_tolerancia);
  const hoy = new Date();
  const actual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  // Ventana: desde la fecha de inicio de conteo (o los últimos 12 meses, lo que sea más corto)
  const limite12Meses = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);
  const fechaBase = new Date(cliente.fecha_inicio_conteo || cliente.fecha_alta);
  const inicio = fechaBase > limite12Meses ? new Date(fechaBase.getFullYear(), fechaBase.getMonth(), 1) : limite12Meses;

  const pagosRes = await db.query(
    `SELECT periodo, SUM(monto)::numeric(10,2) AS pagado, COUNT(*)::int AS abonos
     FROM pagos WHERE cliente_id = $1 AND periodo >= $2
     GROUP BY periodo`,
    [clienteId, inicio.toISOString().slice(0, 10)]
  );
  const mapaPagos = new Map(pagosRes.rows.map(r => [new Date(r.periodo).toISOString().slice(0, 10), r]));

  // Misma regla que usa el semáforo: el día de vencimiento de un mes se ajusta si ese
  // mes no tiene ese día (ej. día 31 en un mes de 30), y hay que sumarle la tolerancia.
  function fechaLimiteDelMes(periodoDate) {
    const ultimoDia = new Date(periodoDate.getFullYear(), periodoDate.getMonth() + 1, 0).getDate();
    const dia = Math.min(diaPago, ultimoDia);
    const vencimiento = new Date(periodoDate.getFullYear(), periodoDate.getMonth(), dia);
    vencimiento.setDate(vencimiento.getDate() + diasTolerancia);
    return vencimiento;
  }

  const desglose = [];
  const cursor = new Date(inicio);
  while (cursor <= actual) {
    const clave = cursor.toISOString().slice(0, 10);
    const registro = mapaPagos.get(clave);
    const pagado = registro ? Number(registro.pagado) : 0;
    const esMesActual = cursor.getTime() === actual.getTime();

    let estado = 'sin_pago';
    if (pagado >= precio) {
      estado = 'completo';
    } else if (pagado > 0) {
      estado = 'parcial';
    } else if (esMesActual) {
      // El mes en curso solo cuenta como "vencido sin pago" si ya pasó su fecha límite
      // (día de pago + tolerancia). Si todavía no llega esa fecha, no se debe marcar como deuda.
      const limite = fechaLimiteDelMes(cursor);
      estado = hoy > limite ? 'sin_pago' : 'pendiente';
    }

    desglose.push({
      periodo: clave,
      esperado: precio,
      pagado,
      saldo: estado === 'pendiente' ? 0 : Math.max(precio - pagado, 0),
      abonos: registro ? registro.abonos : 0,
      estado,
      esMesActual
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  res.json({ desglose: desglose.reverse() }); // más reciente primero
}

async function eliminarPago(req, res) {
  const { id } = req.params;
  const r = await db.query('DELETE FROM pagos WHERE id = $1 RETURNING *', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Pago no encontrado.' });
  res.json({ mensaje: 'Pago eliminado.', pago: r.rows[0] });
}

module.exports = { historialCliente, listarPagos, registrarPago, eliminarPago, desgloseCliente };
