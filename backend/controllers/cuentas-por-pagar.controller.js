const db = require('../config/db');

// ==========================================================
// CUENTAS POR PAGAR (facturas / deudas con proveedores)
//
// Se capturan a mano, con fecha de vencimiento. Mientras están por pagar NO afectan Finanzas.
// Cada pago (completo o una parte) crea su propio egreso en Finanzas y la cuenta pasa a PARCIAL
// hasta que se liquida (PAGADA). Cada pago se puede deshacer por separado (borra solo su egreso).
// "Vencida" no se guarda: es una cuenta sin liquidar cuya fecha de vencimiento ya pasó.
// Todo es exclusivo del administrador (se monta dentro de /api/finanzas).
// ==========================================================

const CATEGORIA_EGRESO = 'Cuentas por pagar';
const METODOS = ['efectivo', 'transferencia', 'deposito', 'tarjeta'];
const HOY_SQL = `(now() AT TIME ZONE 'America/Mexico_City')::date`;

class ErrorNegocio extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

function responderError(res, err, contexto, mensajeGenerico) {
  if (err instanceof ErrorNegocio) return res.status(err.status).json({ error: err.message });
  if (err && err.code === '42P01') { // tabla inexistente: falta correr la migración
    console.error(`Error en ${contexto}: falta una migración de la base de datos`, err.message);
    return res.status(500).json({ error: 'Falta correr una migración de la base de datos. En la Shell del backend ejecuta: node db/migrate.js migrations/024_cuentas_por_pagar.sql' });
  }
  console.error(`Error en ${contexto}:`, err);
  return res.status(500).json({ error: mensajeGenerico });
}

// ---------- validaciones ----------
function entero(valor, nombre) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorNegocio(`${nombre} no es válido.`);
  return n;
}
function dinero(valor) {
  const n = Number(valor);
  if (valor === '' || valor === null || valor === undefined || !Number.isFinite(n) || n <= 0) {
    throw new ErrorNegocio('El monto debe ser mayor a 0.');
  }
  const redondeado = Math.round(n * 100) / 100;
  if (redondeado > 99999999.99) throw new ErrorNegocio('El monto es demasiado grande.');
  return redondeado;
}
function fechaISO(valor, nombre = 'La fecha') {
  const v = String(valor || '');
  const d = new Date(`${v}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(d) || d.toISOString().slice(0, 10) !== v) {
    throw new ErrorNegocio(`${nombre} no es válida.`);
  }
  return v;
}
function texto(valor, nombre, max, obligatorio) {
  const t = String(valor ?? '').trim();
  if (!t) { if (obligatorio) throw new ErrorNegocio(`${nombre} es obligatorio.`); return null; }
  if (t.length > max) throw new ErrorNegocio(`${nombre} es demasiado largo (máximo ${max} caracteres).`);
  return t;
}
const aCentavos = (n) => Math.round(Number(n) * 100);
const dinero2 = (centavos) => (centavos / 100).toFixed(2);

function hoyMexico() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
}

async function conTransaccion(fn) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Columnas calculadas que se agregan a cada cuenta: lo pagado, el saldo, si está vencida y los días que faltan
const CAMPOS_CALCULADOS = `
  COALESCE(ab.pagado, 0) AS pagado,
  COALESCE(ab.num_abonos, 0) AS num_abonos,
  (c.monto - COALESCE(ab.pagado, 0)) AS saldo,
  (c.estado <> 'pagada' AND c.fecha_vencimiento < ${HOY_SQL}) AS vencida,
  (c.fecha_vencimiento - ${HOY_SQL}) AS dias_para_vencer`;
const JOIN_ABONOS = `LEFT JOIN LATERAL (SELECT SUM(a.monto) AS pagado, COUNT(*)::int AS num_abonos
                                         FROM cuentas_por_pagar_abonos a WHERE a.cuenta_id = c.id) ab ON TRUE`;

function formatear(c) {
  return {
    ...c,
    monto: Number(c.monto), pagado: Number(c.pagado), saldo: Number(c.saldo),
    dias_para_vencer: c.dias_para_vencer === null ? null : Number(c.dias_para_vencer)
  };
}

// ==========================================================
// CONSULTAS
// ==========================================================

async function resumen(req, res) {
  try {
    const r = await db.query(
      `SELECT
         COALESCE(SUM(c.monto - COALESCE(ab.pagado, 0)) FILTER (WHERE c.estado <> 'pagada'), 0) AS total_por_pagar,
         COUNT(*) FILTER (WHERE c.estado <> 'pagada')::int AS cuentas_por_pagar,
         COUNT(*) FILTER (WHERE c.estado = 'parcial')::int AS cuentas_parciales,
         COALESCE(SUM(c.monto - COALESCE(ab.pagado, 0)) FILTER (WHERE c.estado <> 'pagada'
            AND c.fecha_vencimiento BETWEEN ${HOY_SQL} AND ${HOY_SQL} + 7), 0) AS vence_semana,
         COUNT(*) FILTER (WHERE c.estado <> 'pagada'
            AND c.fecha_vencimiento BETWEEN ${HOY_SQL} AND ${HOY_SQL} + 7)::int AS cuentas_semana,
         COALESCE(SUM(c.monto - COALESCE(ab.pagado, 0)) FILTER (WHERE c.estado <> 'pagada'
            AND c.fecha_vencimiento < ${HOY_SQL}), 0) AS vencido,
         COUNT(*) FILTER (WHERE c.estado <> 'pagada' AND c.fecha_vencimiento < ${HOY_SQL})::int AS cuentas_vencidas,
         COUNT(*) FILTER (WHERE c.estado = 'pagada')::int AS cuentas_pagadas,
         (SELECT COALESCE(SUM(monto), 0) FROM cuentas_por_pagar_abonos
            WHERE date_trunc('month', fecha) = date_trunc('month', ${HOY_SQL})) AS pagado_mes
       FROM cuentas_por_pagar c ${JOIN_ABONOS}`
    );
    const f = r.rows[0];
    res.json({
      ...f,
      total_por_pagar: Number(f.total_por_pagar), vence_semana: Number(f.vence_semana),
      vencido: Number(f.vencido), pagado_mes: Number(f.pagado_mes)
    });
  } catch (err) { responderError(res, err, 'resumen cuentas por pagar', 'No se pudo cargar el resumen.'); }
}

// ?estado=por_pagar (default: pendientes y parciales) | vencida | pagada | todas   ?q=texto (proveedor, concepto)
async function listar(req, res) {
  try {
    const params = [];
    let where = 'WHERE 1=1';
    const e = req.query.estado || 'por_pagar';
    if (e === 'por_pagar') where += ` AND c.estado <> 'pagada'`;
    else if (e === 'vencida') where += ` AND c.estado <> 'pagada' AND c.fecha_vencimiento < ${HOY_SQL}`;
    else if (e === 'pagada') where += ` AND c.estado = 'pagada'`;
    else if (e !== 'todas') throw new ErrorNegocio('El filtro de estado no es válido.');
    const q = String(req.query.q || '').trim();
    if (q) {
      params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
      where += ` AND (c.proveedor ILIKE $1 OR c.concepto ILIKE $1)`;
    }
    const orden = e === 'pagada' ? 'c.fecha_pago DESC, c.id DESC' : 'c.fecha_vencimiento ASC, c.id ASC';
    const r = await db.query(
      `SELECT c.*, cat.nombre AS categoria_nombre, ${CAMPOS_CALCULADOS}
       FROM cuentas_por_pagar c
       LEFT JOIN egresos_categorias cat ON cat.id = c.categoria_id
       ${JOIN_ABONOS}
       ${where}
       ORDER BY ${orden}
       LIMIT 500`,
      params
    );
    res.json(r.rows.map(formatear));
  } catch (err) { responderError(res, err, 'listar cuentas por pagar', 'No se pudieron cargar las cuentas.'); }
}

async function obtener(req, res) {
  try {
    const id = entero(req.params.id, 'La cuenta');
    const c = await db.query(
      `SELECT c.*, cat.nombre AS categoria_nombre, ${CAMPOS_CALCULADOS}
       FROM cuentas_por_pagar c LEFT JOIN egresos_categorias cat ON cat.id = c.categoria_id ${JOIN_ABONOS}
       WHERE c.id = $1`, [id]
    );
    if (!c.rows[0]) throw new ErrorNegocio('Cuenta no encontrada.', 404);
    const abonos = await db.query(
      `SELECT id, monto, fecha, metodo_pago, notas, egreso_id, creado_en
       FROM cuentas_por_pagar_abonos WHERE cuenta_id = $1 ORDER BY fecha, id`, [id]
    );
    res.json({ ...formatear(c.rows[0]), abonos: abonos.rows.map(a => ({ ...a, monto: Number(a.monto) })) });
  } catch (err) { responderError(res, err, 'obtener cuenta por pagar', 'No se pudo cargar la cuenta.'); }
}

// ==========================================================
// ACCIONES
// ==========================================================

async function categoriaValida(cliente, valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const id = entero(valor, 'La categoría');
  const r = await cliente.query('SELECT id FROM egresos_categorias WHERE id = $1', [id]);
  if (!r.rows[0]) throw new ErrorNegocio('La categoría no existe.', 404);
  return id;
}

async function crear(req, res) {
  try {
    const proveedor = texto(req.body.proveedor, 'El proveedor', 120, true);
    const concepto = texto(req.body.concepto, 'El concepto', 150, true);
    const monto = dinero(req.body.monto);
    const vence = fechaISO(req.body.fecha_vencimiento, 'La fecha de vencimiento');
    const notas = texto(req.body.notas, 'Las notas', 2000, false);
    const cat = await categoriaValida(db, req.body.categoria_id);
    const r = await db.query(
      `INSERT INTO cuentas_por_pagar (proveedor, concepto, categoria_id, monto, fecha_vencimiento, notas, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [proveedor, concepto, cat, monto, vence, notas, req.usuario.id]
    );
    res.status(201).json({ ...r.rows[0], monto: Number(r.rows[0].monto) });
  } catch (err) { responderError(res, err, 'crear cuenta por pagar', 'No se pudo guardar la cuenta.'); }
}

// Pendiente o parcial: se puede cambiar todo, pero el monto nunca queda por debajo de lo ya pagado
// (si queda igual, la cuenta se liquida). Pagada: nada (hay que deshacer pagos primero).
async function actualizar(req, res) {
  try {
    const id = entero(req.params.id, 'La cuenta');
    const b = req.body;
    const cuenta = await conTransaccion(async (c) => {
      const p = await c.query('SELECT * FROM cuentas_por_pagar WHERE id = $1 FOR UPDATE', [id]);
      if (!p.rows[0]) throw new ErrorNegocio('Cuenta no encontrada.', 404);
      if (p.rows[0].estado === 'pagada') {
        throw new ErrorNegocio('Esta cuenta ya está liquidada. Deshaz alguno de sus pagos si necesitas cambiarla.', 409);
      }
      const sets = []; const params = [];
      const poner = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
      if (b.proveedor !== undefined) poner('proveedor', texto(b.proveedor, 'El proveedor', 120, true));
      if (b.concepto !== undefined) poner('concepto', texto(b.concepto, 'El concepto', 150, true));
      if (b.notas !== undefined) poner('notas', texto(b.notas, 'Las notas', 2000, false));
      if (b.fecha_vencimiento !== undefined) poner('fecha_vencimiento', fechaISO(b.fecha_vencimiento, 'La fecha de vencimiento'));
      if (b.categoria_id !== undefined) poner('categoria_id', await categoriaValida(c, b.categoria_id));
      if (b.monto !== undefined) {
        const monto = dinero(b.monto);
        const pagadoC = aCentavos((await c.query('SELECT COALESCE(SUM(monto), 0) AS t FROM cuentas_por_pagar_abonos WHERE cuenta_id = $1', [id])).rows[0].t);
        if (aCentavos(monto) < pagadoC) throw new ErrorNegocio(`Ya se han pagado $${dinero2(pagadoC)}: el monto no puede ser menor a eso.`);
        poner('monto', monto);
        if (pagadoC > 0 && aCentavos(monto) === pagadoC) {
          sets.push(`estado = 'pagada'`, `fecha_pago = (SELECT MAX(fecha) FROM cuentas_por_pagar_abonos WHERE cuenta_id = ${id})`);
        }
      }
      if (!sets.length) throw new ErrorNegocio('No se enviaron cambios.');
      params.push(id);
      const upd = await c.query(`UPDATE cuentas_por_pagar SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
      return upd.rows[0];
    });
    res.json({ ...cuenta, monto: Number(cuenta.monto) });
  } catch (err) { responderError(res, err, 'actualizar cuenta por pagar', 'No se pudo actualizar la cuenta.'); }
}

// Solo se borra si todavía no tiene pagos (si los tiene, hay que deshacerlos antes)
async function eliminar(req, res) {
  try {
    const id = entero(req.params.id, 'La cuenta');
    await conTransaccion(async (c) => {
      const p = await c.query('SELECT estado FROM cuentas_por_pagar WHERE id = $1 FOR UPDATE', [id]);
      if (!p.rows[0]) throw new ErrorNegocio('Cuenta no encontrada.', 404);
      if (p.rows[0].estado !== 'pendiente') {
        throw new ErrorNegocio('Esta cuenta ya tiene pagos registrados. Deshaz primero sus pagos para poder eliminarla.', 409);
      }
      await c.query('DELETE FROM cuentas_por_pagar WHERE id = $1', [id]);
    });
    res.json({ mensaje: 'Cuenta eliminada.' });
  } catch (err) { responderError(res, err, 'eliminar cuenta por pagar', 'No se pudo eliminar la cuenta.'); }
}

// Registra un pago (completo o una parte) → crea un egreso en Finanzas por ESE monto.
// Sin "monto" se paga todo lo que falta. No se puede pagar más de lo que falta.
async function registrarAbono(req, res) {
  try {
    const id = entero(req.params.id, 'La cuenta');
    const fecha = req.body.fecha_pago ? fechaISO(req.body.fecha_pago, 'La fecha de pago') : hoyMexico();
    const metodo = req.body.metodo_pago || 'efectivo';
    if (!METODOS.includes(metodo)) throw new ErrorNegocio('El método de pago no es válido.');
    const pedido = (req.body.monto === undefined || req.body.monto === null || req.body.monto === '') ? null : dinero(req.body.monto);
    const notasAbono = texto(req.body.notas, 'La nota', 500, false);

    const cuenta = await conTransaccion(async (c) => {
      const p = await c.query('SELECT * FROM cuentas_por_pagar WHERE id = $1 FOR UPDATE', [id]);
      const cx = p.rows[0];
      if (!cx) throw new ErrorNegocio('Cuenta no encontrada.', 404);
      if (cx.estado === 'pagada') throw new ErrorNegocio('Esta cuenta ya está liquidada: no falta nada por pagar.', 409);

      const ab = (await c.query('SELECT COUNT(*)::int AS n, COALESCE(SUM(monto), 0) AS total FROM cuentas_por_pagar_abonos WHERE cuenta_id = $1', [id])).rows[0];
      const totalC = aCentavos(cx.monto), pagadoC = aCentavos(ab.total), saldoC = totalC - pagadoC;
      const montoC = pedido === null ? saldoC : aCentavos(pedido);
      if (montoC <= 0) throw new ErrorNegocio('El monto debe ser mayor a 0.');
      if (montoC > saldoC) {
        throw new ErrorNegocio(`El pago de $${dinero2(montoC)} es mayor a lo que falta por pagar ($${dinero2(saldoC)}).`);
      }

      // Categoría del egreso: la elegida en la cuenta o, si no tiene, "Cuentas por pagar"
      let catId = cx.categoria_id;
      if (!catId) {
        let cat = await c.query('SELECT id FROM egresos_categorias WHERE nombre = $1', [CATEGORIA_EGRESO]);
        if (!cat.rows[0]) cat = await c.query('INSERT INTO egresos_categorias (nombre) VALUES ($1) RETURNING id', [CATEGORIA_EGRESO]);
        catId = cat.rows[0].id;
      }

      const liquida = pagadoC + montoC === totalC;
      const sufijo = (ab.n === 0 && liquida) ? '' : ` — abono ${ab.n + 1}`;
      const concepto = `${cx.proveedor}: ${cx.concepto}${sufijo}`.slice(0, 150);
      const egreso = await c.query(
        `INSERT INTO egresos (categoria_id, concepto, monto, fecha, registrado_por, notas)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [catId, concepto, montoC / 100, fecha, req.usuario.id, notasAbono || cx.notas]
      );
      await c.query(
        `INSERT INTO cuentas_por_pagar_abonos (cuenta_id, monto, fecha, metodo_pago, notas, egreso_id, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, montoC / 100, fecha, metodo, notasAbono, egreso.rows[0].id, req.usuario.id]
      );
      const upd = await c.query(
        liquida
          ? `UPDATE cuentas_por_pagar SET estado = 'pagada', fecha_pago = (SELECT MAX(fecha) FROM cuentas_por_pagar_abonos WHERE cuenta_id = $1) WHERE id = $1 RETURNING *`
          : `UPDATE cuentas_por_pagar SET estado = 'parcial', fecha_pago = NULL WHERE id = $1 RETURNING *`,
        [id]
      );
      return { ...upd.rows[0], monto: Number(upd.rows[0].monto), pagado: (pagadoC + montoC) / 100, saldo: (saldoC - montoC) / 100 };
    });
    res.json(cuenta);
  } catch (err) { responderError(res, err, 'registrar pago de cuenta', 'No se pudo registrar el pago.'); }
}

// Deshace UN pago: borra su egreso de Finanzas y recalcula el estado de la cuenta
async function deshacerAbono(req, res) {
  try {
    const id = entero(req.params.id, 'La cuenta');
    const abonoId = entero(req.params.abonoId, 'El pago');
    const cuenta = await conTransaccion(async (c) => {
      const p = await c.query('SELECT * FROM cuentas_por_pagar WHERE id = $1 FOR UPDATE', [id]);
      if (!p.rows[0]) throw new ErrorNegocio('Cuenta no encontrada.', 404);
      const ab = await c.query('SELECT * FROM cuentas_por_pagar_abonos WHERE id = $1 AND cuenta_id = $2 FOR UPDATE', [abonoId, id]);
      if (!ab.rows[0]) throw new ErrorNegocio('Ese pago no existe en esta cuenta.', 404);

      await c.query('DELETE FROM cuentas_por_pagar_abonos WHERE id = $1', [abonoId]);
      if (ab.rows[0].egreso_id) await c.query('DELETE FROM egresos WHERE id = $1', [ab.rows[0].egreso_id]);

      const pagado = (await c.query('SELECT COALESCE(SUM(monto), 0) AS t FROM cuentas_por_pagar_abonos WHERE cuenta_id = $1', [id])).rows[0].t;
      const pagC = aCentavos(pagado);
      const estado = pagC === 0 ? 'pendiente' : (pagC >= aCentavos(p.rows[0].monto) ? 'pagada' : 'parcial');
      const upd = await c.query(
        estado === 'pagada'
          ? `UPDATE cuentas_por_pagar SET estado = 'pagada', fecha_pago = (SELECT MAX(fecha) FROM cuentas_por_pagar_abonos WHERE cuenta_id = $1) WHERE id = $1 RETURNING *`
          : `UPDATE cuentas_por_pagar SET estado = $2, fecha_pago = NULL WHERE id = $1 RETURNING *`,
        estado === 'pagada' ? [id] : [id, estado]
      );
      return { ...upd.rows[0], monto: Number(upd.rows[0].monto), pagado: pagC / 100, saldo: (aCentavos(upd.rows[0].monto) - pagC) / 100 };
    });
    res.json(cuenta);
  } catch (err) { responderError(res, err, 'deshacer pago de cuenta', 'No se pudo deshacer el pago.'); }
}

module.exports = { resumen, listar, obtener, crear, actualizar, eliminar, registrarAbono, deshacerAbono };
