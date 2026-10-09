const db = require('../config/db');

// ==========================================================
// PAGOS A TÉCNICOS
//
// El administrador junta actividades terminadas de un técnico y le pone un TOTAL a su criterio;
// queda PENDIENTE (no afecta Finanzas). Ese total se puede pagar completo o EN PARTES (abonos):
// cada parte que se registra crea su propio egreso en Finanzas, y el pago pasa a PARCIAL hasta
// que se liquida (PAGADO). Cada abono se puede deshacer por separado (borra solo su egreso).
//
// Reglas: solo cuentan actividades COMPLETADAS, que no sean de categoría Libranza, que NO
// estén asignadas a un administrador, que no estén marcadas "sin pago" y que no estén ya
// dentro de otro pago. Todo es exclusivo del administrador (se monta dentro de /api/finanzas).
// ==========================================================

const CATEGORIA_EGRESO = 'Pago a técnicos';
const METODOS = ['efectivo', 'transferencia', 'deposito', 'tarjeta'];
const MENSAJE_NO_DISPONIBLES =
  'Algunas actividades ya no están disponibles para pago (ya están en otro pago, se marcaron sin pago, ' +
  'no están completadas o no son de ese técnico). Actualiza la lista e inténtalo de nuevo.';

// Actividades que SÍ se pagan y todavía no están agrupadas (a = actividades, u = usuarios del técnico)
const ELEGIBLES = `
  a.estado = 'completada'
  AND a.tipo <> 'libranza'
  AND u.rol <> 'admin'
  AND NOT EXISTS (SELECT 1 FROM pagos_tecnicos_actividades pa WHERE pa.actividad_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM actividades_sin_pago sp WHERE sp.actividad_id = a.id)`;

class ErrorNegocio extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

function responderError(res, err, contexto, mensajeGenerico) {
  if (err && err.code === '23505') err = new ErrorNegocio(MENSAJE_NO_DISPONIBLES, 409); // otra persona agrupó lo mismo al mismo tiempo
  if (err instanceof ErrorNegocio) return res.status(err.status).json({ error: err.message });
  if (err && err.code === '42P01') { // tabla inexistente: falta correr la migración
    console.error(`Error en ${contexto}: falta una migración de la base de datos`, err.message);
    return res.status(500).json({ error: 'Falta correr una migración de la base de datos. En la Shell del backend ejecuta: npm run db:migrate migrations/021_abonos_pagos_tecnicos.sql (y antes la 020 si no la has corrido).' });
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
function listaIds(valor) {
  if (!Array.isArray(valor) || !valor.length) throw new ErrorNegocio('Selecciona al menos una actividad.');
  const ids = [...new Set(valor.map(Number))];
  if (ids.some(n => !Number.isInteger(n) || n <= 0)) throw new ErrorNegocio('La lista de actividades no es válida.');
  if (ids.length > 200) throw new ErrorNegocio('Son demasiadas actividades de una sola vez (máximo 200).');
  return ids;
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
function fechaISO(valor) {
  const v = String(valor || '');
  const d = new Date(`${v}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(d) || d.toISOString().slice(0, 10) !== v) {
    throw new ErrorNegocio('La fecha no es válida.');
  }
  return v;
}
const aCentavos = (n) => Math.round(Number(n) * 100);
const dinero2 = (centavos) => (centavos / 100).toFixed(2);
// Convierte los campos numéricos de un pago (que pg entrega como texto) y calcula lo que falta
function conSaldo(p, pagado) {
  const monto = Number(p.monto);
  const pag = Number(pagado || 0);
  return { ...p, monto, pagado: pag, saldo: Number(((aCentavos(monto) - aCentavos(pag)) / 100).toFixed(2)) };
}

function hoyMexico() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date()); // YYYY-MM-DD
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

// Confirma (y bloquea) que todas las actividades siguen disponibles para pago y son de ese técnico.
async function asegurarElegibles(c, ids, tecnicoId) {
  const r = await c.query(
    `SELECT a.id FROM actividades a JOIN usuarios u ON u.id = a.tecnico_id
     WHERE a.id = ANY($1::int[]) AND a.tecnico_id = $2 AND ${ELEGIBLES}
     FOR UPDATE OF a`,
    [ids, tecnicoId]
  );
  if (r.rows.length !== ids.length) throw new ErrorNegocio(MENSAJE_NO_DISPONIBLES, 409);
}

// ==========================================================
// CONSULTAS
// ==========================================================

async function listarTecnicos(req, res) {
  try {
    const r = await db.query(`SELECT id, nombre, activo FROM usuarios WHERE rol = 'tecnico' ORDER BY activo DESC, nombre`);
    res.json(r.rows);
  } catch (err) { responderError(res, err, 'listarTecnicos', 'No se pudieron cargar los técnicos.'); }
}

async function resumen(req, res) {
  try {
    const r = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM actividades a JOIN usuarios u ON u.id = a.tecnico_id WHERE ${ELEGIBLES}) AS actividades_por_agrupar,
         (SELECT COUNT(DISTINCT a.tecnico_id)::int FROM actividades a JOIN usuarios u ON u.id = a.tecnico_id WHERE ${ELEGIBLES}) AS tecnicos_con_pendientes,
         (SELECT COUNT(*)::int FROM pagos_tecnicos WHERE estado IN ('pendiente','parcial')) AS pagos_pendientes,
         (SELECT COUNT(*)::int FROM pagos_tecnicos WHERE estado = 'parcial') AS pagos_parciales,
         -- lo que todavía se debe: total de los pagos sin liquidar menos lo ya abonado a esos mismos pagos
         (SELECT (COALESCE(SUM(p.monto), 0) - COALESCE(SUM((SELECT SUM(a.monto) FROM pagos_tecnicos_abonos a WHERE a.pago_id = p.id)), 0))::numeric(12,2)
            FROM pagos_tecnicos p WHERE p.estado IN ('pendiente','parcial')) AS monto_pendiente,
         (SELECT COALESCE(SUM(monto), 0)::numeric(12,2) FROM pagos_tecnicos_abonos
            WHERE date_trunc('month', fecha) = date_trunc('month', CURRENT_DATE)) AS pagado_mes`
    );
    const f = r.rows[0];
    res.json({ ...f, monto_pendiente: Number(f.monto_pendiente), pagado_mes: Number(f.pagado_mes) });
  } catch (err) { responderError(res, err, 'resumen pagos técnicos', 'No se pudo cargar el resumen.'); }
}

async function actividadesPorAgrupar(req, res) {
  try {
    const params = [];
    let filtro = '';
    if (req.query.tecnico_id) { params.push(entero(req.query.tecnico_id, 'El técnico')); filtro = ` AND a.tecnico_id = $${params.length}`; }
    const r = await db.query(
      `SELECT a.id, a.titulo, a.tipo, a.completado_en, a.creado_en, a.tecnico_id, u.nombre AS tecnico_nombre,
              c.cliente_id AS cliente_folio, c.nombre AS cliente_nombre
       FROM actividades a
       JOIN usuarios u ON u.id = a.tecnico_id
       LEFT JOIN clientes c ON c.id = a.cliente_id
       WHERE ${ELEGIBLES}${filtro}
       ORDER BY u.nombre, COALESCE(a.completado_en, a.creado_en) DESC, a.id DESC`,
      params
    );
    res.json(r.rows);
  } catch (err) { responderError(res, err, 'actividadesPorAgrupar', 'No se pudieron cargar las actividades.'); }
}

async function actividadesFueraDePago(req, res) {
  try {
    const params = [];
    let filtro = '';
    if (req.query.tecnico_id) { params.push(entero(req.query.tecnico_id, 'El técnico')); filtro = ` WHERE a.tecnico_id = $${params.length}`; }
    const r = await db.query(
      `SELECT a.id, a.titulo, a.tipo, a.estado, a.completado_en, a.creado_en, a.tecnico_id, u.nombre AS tecnico_nombre,
              c.cliente_id AS cliente_folio, c.nombre AS cliente_nombre, sp.creado_en AS marcado_en
       FROM actividades_sin_pago sp
       JOIN actividades a ON a.id = sp.actividad_id
       JOIN usuarios u ON u.id = a.tecnico_id
       LEFT JOIN clientes c ON c.id = a.cliente_id${filtro}
       ORDER BY u.nombre, COALESCE(a.completado_en, a.creado_en) DESC, a.id DESC`,
      params
    );
    res.json(r.rows);
  } catch (err) { responderError(res, err, 'actividadesFueraDePago', 'No se pudieron cargar las actividades.'); }
}

async function listarPagos(req, res) {
  try {
    const params = [];
    let where = 'WHERE 1=1';
    const e = req.query.estado;
    if (e === 'por_pagar') where += ` AND p.estado IN ('pendiente','parcial')`;
    else if (e === 'pendiente' || e === 'parcial' || e === 'pagado') { params.push(e); where += ` AND p.estado = $${params.length}`; }
    if (req.query.tecnico_id) { params.push(entero(req.query.tecnico_id, 'El técnico')); where += ` AND p.tecnico_id = $${params.length}`; }
    const r = await db.query(
      `SELECT p.id, p.tecnico_id, u.nombre AS tecnico_nombre, p.monto, p.notas, p.estado, p.fecha_pago,
              p.metodo_pago, p.creado_en,
              (SELECT COUNT(*)::int FROM pagos_tecnicos_actividades pa WHERE pa.pago_id = p.id) AS num_actividades,
              ab.pagado, COALESCE(ab.num_abonos, 0) AS num_abonos
       FROM pagos_tecnicos p
       JOIN usuarios u ON u.id = p.tecnico_id
       LEFT JOIN LATERAL (SELECT SUM(a.monto) AS pagado, COUNT(*)::int AS num_abonos FROM pagos_tecnicos_abonos a WHERE a.pago_id = p.id) ab ON TRUE
       ${where}
       ORDER BY p.creado_en DESC, p.id DESC
       LIMIT 200`,
      params
    );
    res.json(r.rows.map(x => conSaldo(x, x.pagado)));
  } catch (err) { responderError(res, err, 'listarPagos', 'No se pudieron cargar los pagos.'); }
}

async function obtenerPago(req, res) {
  try {
    const id = entero(req.params.id, 'El pago');
    const p = await db.query(
      `SELECT p.*, u.nombre AS tecnico_nombre FROM pagos_tecnicos p JOIN usuarios u ON u.id = p.tecnico_id WHERE p.id = $1`,
      [id]
    );
    if (!p.rows[0]) throw new ErrorNegocio('Pago no encontrado.', 404);
    const acts = await db.query(
      `SELECT a.id, a.titulo, a.tipo, a.estado, a.completado_en, a.creado_en,
              c.cliente_id AS cliente_folio, c.nombre AS cliente_nombre
       FROM pagos_tecnicos_actividades pa
       JOIN actividades a ON a.id = pa.actividad_id
       LEFT JOIN clientes c ON c.id = a.cliente_id
       WHERE pa.pago_id = $1
       ORDER BY COALESCE(a.completado_en, a.creado_en) DESC, a.id DESC`,
      [id]
    );
    const abonos = await db.query(
      `SELECT id, monto, fecha, metodo_pago, notas, egreso_id, creado_en
       FROM pagos_tecnicos_abonos WHERE pago_id = $1 ORDER BY fecha, id`,
      [id]
    );
    const abonosNum = abonos.rows.map(a => ({ ...a, monto: Number(a.monto) }));
    const pagado = abonosNum.reduce((t, a) => t + aCentavos(a.monto), 0) / 100;
    res.json({ ...conSaldo(p.rows[0], pagado), actividades: acts.rows, abonos: abonosNum });
  } catch (err) { responderError(res, err, 'obtenerPago', 'No se pudo cargar el pago.'); }
}

// ==========================================================
// ACCIONES
// ==========================================================

// Agrupa actividades de un técnico y les pone un monto → pago PENDIENTE (no toca Finanzas)
async function crearPago(req, res) {
  try {
    const tecnicoId = entero(req.body.tecnico_id, 'El técnico');
    const ids = listaIds(req.body.actividad_ids);
    const monto = dinero(req.body.monto);
    const notas = req.body.notas ? String(req.body.notas).trim() || null : null;

    const pago = await conTransaccion(async (c) => {
      const tec = await c.query(`SELECT id FROM usuarios WHERE id = $1 AND rol = 'tecnico'`, [tecnicoId]);
      if (!tec.rows[0]) throw new ErrorNegocio('El técnico no existe.', 404);
      await asegurarElegibles(c, ids, tecnicoId);
      const ins = await c.query(
        `INSERT INTO pagos_tecnicos (tecnico_id, monto, notas, creado_por) VALUES ($1,$2,$3,$4) RETURNING *`,
        [tecnicoId, monto, notas, req.usuario.id]
      );
      await c.query(
        `INSERT INTO pagos_tecnicos_actividades (pago_id, actividad_id) SELECT $1, UNNEST($2::int[])`,
        [ins.rows[0].id, ids]
      );
      return ins.rows[0];
    });
    res.status(201).json(pago);
  } catch (err) { responderError(res, err, 'crearPago', 'No se pudo guardar el pago.'); }
}

// Cambia total / notas / actividades. Pendiente: todo. Parcial (ya tiene abonos): solo el total (nunca menor
// a lo ya pagado) y las notas; las actividades quedan fijas. Pagado: nada (hay que deshacer abonos).
async function actualizarPago(req, res) {
  try {
    const id = entero(req.params.id, 'El pago');
    const { monto, notas, actividad_ids } = req.body;
    if (monto === undefined && notas === undefined && actividad_ids === undefined) {
      throw new ErrorNegocio('No se enviaron cambios.');
    }
    const montoNuevo = monto !== undefined ? dinero(monto) : undefined;
    const idsNuevos = actividad_ids !== undefined ? listaIds(actividad_ids) : undefined;

    const pago = await conTransaccion(async (c) => {
      const p = await c.query('SELECT * FROM pagos_tecnicos WHERE id = $1 FOR UPDATE', [id]);
      if (!p.rows[0]) throw new ErrorNegocio('Pago no encontrado.', 404);
      const estado = p.rows[0].estado;
      if (estado === 'pagado') {
        throw new ErrorNegocio('Este pago ya está liquidado. Deshaz alguno de sus abonos si necesitas cambiarlo.', 409);
      }
      if (estado === 'parcial' && idsNuevos) {
        throw new ErrorNegocio('Este pago ya tiene abonos registrados: sus actividades ya no se pueden cambiar (sí puedes cambiar el total y las notas).', 409);
      }

      const pagadoC = aCentavos((await c.query('SELECT COALESCE(SUM(monto), 0) AS t FROM pagos_tecnicos_abonos WHERE pago_id = $1', [id])).rows[0].t);
      if (montoNuevo !== undefined && aCentavos(montoNuevo) < pagadoC) {
        throw new ErrorNegocio(`Ya se han pagado $${dinero2(pagadoC)}: el total no puede ser menor a eso.`);
      }

      if (idsNuevos) {
        const actuales = (await c.query('SELECT actividad_id FROM pagos_tecnicos_actividades WHERE pago_id = $1', [id]))
          .rows.map(r => r.actividad_id);
        const porAgregar = idsNuevos.filter(x => !actuales.includes(x));
        if (porAgregar.length) await asegurarElegibles(c, porAgregar, p.rows[0].tecnico_id);
        await c.query('DELETE FROM pagos_tecnicos_actividades WHERE pago_id = $1 AND NOT (actividad_id = ANY($2::int[]))', [id, idsNuevos]);
        if (porAgregar.length) {
          await c.query('INSERT INTO pagos_tecnicos_actividades (pago_id, actividad_id) SELECT $1, UNNEST($2::int[])', [id, porAgregar]);
        }
      }

      const sets = []; const params = [];
      if (montoNuevo !== undefined) { params.push(montoNuevo); sets.push(`monto = $${params.length}`); }
      if (notas !== undefined) { params.push(String(notas || '').trim() || null); sets.push(`notas = $${params.length}`); }
      // Si el nuevo total es justo lo ya pagado, el pago queda liquidado
      if (montoNuevo !== undefined && pagadoC > 0 && aCentavos(montoNuevo) === pagadoC) {
        sets.push(`estado = 'pagado'`, `fecha_pago = (SELECT MAX(fecha) FROM pagos_tecnicos_abonos WHERE pago_id = ${id})`);
      }
      if (!sets.length) return p.rows[0];
      params.push(id);
      const upd = await c.query(`UPDATE pagos_tecnicos SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
      return upd.rows[0];
    });
    res.json({ ...pago, monto: Number(pago.monto) });
  } catch (err) { responderError(res, err, 'actualizarPago', 'No se pudo actualizar el pago.'); }
}

// Cancela un pago pendiente: sus actividades quedan libres otra vez
async function cancelarPago(req, res) {
  try {
    const id = entero(req.params.id, 'El pago');
    await conTransaccion(async (c) => {
      const p = await c.query('SELECT estado FROM pagos_tecnicos WHERE id = $1 FOR UPDATE', [id]);
      if (!p.rows[0]) throw new ErrorNegocio('Pago no encontrado.', 404);
      if (p.rows[0].estado !== 'pendiente') {
        throw new ErrorNegocio('Este pago ya tiene abonos registrados. Deshaz primero sus abonos para poder cancelarlo.', 409);
      }
      await c.query('DELETE FROM pagos_tecnicos WHERE id = $1', [id]);
    });
    res.json({ mensaje: 'Pago cancelado. Sus actividades quedaron libres otra vez.' });
  } catch (err) { responderError(res, err, 'cancelarPago', 'No se pudo cancelar el pago.'); }
}

// Registra un pago (completo o una parte) → crea un egreso en Finanzas por ESE monto.
// Sin "monto" se paga todo lo que falta. No se puede pagar más de lo que falta.
async function registrarAbono(req, res) {
  try {
    const id = entero(req.params.id, 'El pago');
    const fecha = req.body.fecha_pago ? fechaISO(req.body.fecha_pago) : hoyMexico();
    const metodo = req.body.metodo_pago || 'efectivo';
    if (!METODOS.includes(metodo)) throw new ErrorNegocio('El método de pago no es válido.');
    const pedido = (req.body.monto === undefined || req.body.monto === null || req.body.monto === '') ? null : dinero(req.body.monto);
    const notasAbono = req.body.notas ? String(req.body.notas).trim() || null : null;

    const pago = await conTransaccion(async (c) => {
      const p = await c.query(
        `SELECT p.*, u.nombre AS tecnico_nombre FROM pagos_tecnicos p JOIN usuarios u ON u.id = p.tecnico_id
         WHERE p.id = $1 FOR UPDATE OF p`,
        [id]
      );
      const pt = p.rows[0];
      if (!pt) throw new ErrorNegocio('Pago no encontrado.', 404);
      if (pt.estado === 'pagado') throw new ErrorNegocio('Este pago ya está liquidado: no falta nada por pagar.', 409);

      const ab = (await c.query('SELECT COUNT(*)::int AS n, COALESCE(SUM(monto), 0) AS total FROM pagos_tecnicos_abonos WHERE pago_id = $1', [id])).rows[0];
      const totalC = aCentavos(pt.monto), pagadoC = aCentavos(ab.total), saldoC = totalC - pagadoC;
      const montoC = pedido === null ? saldoC : aCentavos(pedido);
      if (montoC <= 0) throw new ErrorNegocio('El monto debe ser mayor a 0.');
      if (montoC > saldoC) {
        throw new ErrorNegocio(`El pago de $${dinero2(montoC)} es mayor a lo que falta por pagar ($${dinero2(saldoC)}).`);
      }

      const nAct = (await c.query('SELECT COUNT(*)::int AS n FROM pagos_tecnicos_actividades WHERE pago_id = $1', [id])).rows[0].n;
      if (nAct === 0) throw new ErrorNegocio('Este pago ya no tiene actividades (se borraron). Cancélalo y crea uno nuevo.', 409);

      let cat = await c.query('SELECT id FROM egresos_categorias WHERE nombre = $1', [CATEGORIA_EGRESO]);
      if (!cat.rows[0]) cat = await c.query('INSERT INTO egresos_categorias (nombre) VALUES ($1) RETURNING id', [CATEGORIA_EGRESO]);

      const liquida = pagadoC + montoC === totalC;
      const sufijo = (ab.n === 0 && liquida) ? '' : ` — abono ${ab.n + 1}`;
      const concepto = `Pago a técnico: ${pt.tecnico_nombre} (${nAct} actividad${nAct === 1 ? '' : 'es'})${sufijo}`.slice(0, 150);
      const egreso = await c.query(
        `INSERT INTO egresos (categoria_id, concepto, monto, fecha, registrado_por, notas)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [cat.rows[0].id, concepto, montoC / 100, fecha, req.usuario.id, notasAbono || pt.notas]
      );
      await c.query(
        `INSERT INTO pagos_tecnicos_abonos (pago_id, monto, fecha, metodo_pago, notas, egreso_id, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, montoC / 100, fecha, metodo, notasAbono, egreso.rows[0].id, req.usuario.id]
      );
      const upd = await c.query(
        liquida
          ? `UPDATE pagos_tecnicos SET estado = 'pagado', fecha_pago = (SELECT MAX(fecha) FROM pagos_tecnicos_abonos WHERE pago_id = $1),
               metodo_pago = $2, pagado_en = now() WHERE id = $1 RETURNING *`
          : `UPDATE pagos_tecnicos SET estado = 'parcial', fecha_pago = NULL, metodo_pago = NULL, pagado_en = NULL WHERE id = $1 RETURNING *`,
        liquida ? [id, metodo] : [id]
      );
      return conSaldo(upd.rows[0], (pagadoC + montoC) / 100);
    });
    res.json(pago);
  } catch (err) { responderError(res, err, 'registrarAbono', 'No se pudo registrar el pago.'); }
}

// Deshace UN abono: borra su egreso de Finanzas y recalcula el estado del pago
async function deshacerAbono(req, res) {
  try {
    const id = entero(req.params.id, 'El pago');
    const abonoId = entero(req.params.abonoId, 'El abono');
    const pago = await conTransaccion(async (c) => {
      const p = await c.query('SELECT * FROM pagos_tecnicos WHERE id = $1 FOR UPDATE', [id]);
      if (!p.rows[0]) throw new ErrorNegocio('Pago no encontrado.', 404);
      const ab = await c.query('SELECT * FROM pagos_tecnicos_abonos WHERE id = $1 AND pago_id = $2 FOR UPDATE', [abonoId, id]);
      if (!ab.rows[0]) throw new ErrorNegocio('Ese abono no existe en este pago.', 404);

      if (ab.rows[0].egreso_id) await c.query('DELETE FROM egresos WHERE id = $1', [ab.rows[0].egreso_id]);
      await c.query('DELETE FROM pagos_tecnicos_abonos WHERE id = $1', [abonoId]);

      const pagado = (await c.query('SELECT COALESCE(SUM(monto), 0) AS t FROM pagos_tecnicos_abonos WHERE pago_id = $1', [id])).rows[0].t;
      const estado = aCentavos(pagado) === 0 ? 'pendiente' : (aCentavos(pagado) >= aCentavos(p.rows[0].monto) ? 'pagado' : 'parcial');
      const upd = await c.query(
        estado === 'pagado'
          ? `UPDATE pagos_tecnicos SET estado = 'pagado', fecha_pago = (SELECT MAX(fecha) FROM pagos_tecnicos_abonos WHERE pago_id = $1) WHERE id = $1 RETURNING *`
          : `UPDATE pagos_tecnicos SET estado = $2, fecha_pago = NULL, metodo_pago = NULL, pagado_en = NULL, egreso_id = NULL WHERE id = $1 RETURNING *`,
        estado === 'pagado' ? [id] : [id, estado]
      );
      return conSaldo(upd.rows[0], pagado);
    });
    res.json(pago);
  } catch (err) { responderError(res, err, 'deshacerAbono', 'No se pudo deshacer el abono.'); }
}

// ---------- actividades que no generan pago ----------

async function excluirActividades(req, res) {
  try {
    const ids = listaIds(req.body.actividad_ids);
    await conTransaccion(async (c) => {
      const r = await c.query(
        `SELECT a.id, EXISTS (SELECT 1 FROM pagos_tecnicos_actividades pa WHERE pa.actividad_id = a.id) AS en_pago
         FROM actividades a WHERE a.id = ANY($1::int[]) FOR UPDATE OF a`,
        [ids]
      );
      if (r.rows.length !== ids.length) throw new ErrorNegocio('Alguna de las actividades ya no existe.', 404);
      if (r.rows.some(x => x.en_pago)) throw new ErrorNegocio('Alguna actividad ya está dentro de un pago. Quítala del pago primero.', 409);
      await c.query(
        'INSERT INTO actividades_sin_pago (actividad_id, marcado_por) SELECT UNNEST($1::int[]), $2 ON CONFLICT DO NOTHING',
        [ids, req.usuario.id]
      );
    });
    res.json({ cantidad: ids.length });
  } catch (err) { responderError(res, err, 'excluirActividades', 'No se pudo dejar la actividad fuera de pago.'); }
}

async function incluirActividades(req, res) {
  try {
    const ids = listaIds(req.body.actividad_ids);
    const r = await db.query('DELETE FROM actividades_sin_pago WHERE actividad_id = ANY($1::int[])', [ids]);
    res.json({ cantidad: r.rowCount });
  } catch (err) { responderError(res, err, 'incluirActividades', 'No se pudo volver a incluir la actividad.'); }
}

// Deja fuera de pago las completadas ANTES de una fecha (para no arrancar con todo el historial
// como "sin pagar"). Con solo_contar = true solo dice cuántas serían, sin cambiar nada.
async function excluirAnteriores(req, res) {
  try {
    const hasta = fechaISO(req.body.hasta);
    const soloContar = req.body.solo_contar === true || req.body.solo_contar === 'true';
    const params = [hasta];
    let filtro = '';
    if (req.body.tecnico_id) { params.push(entero(req.body.tecnico_id, 'El técnico')); filtro = ` AND a.tecnico_id = $${params.length}`; }

    const cantidad = await conTransaccion(async (c) => {
      const r = await c.query(
        `SELECT a.id FROM actividades a JOIN usuarios u ON u.id = a.tecnico_id
         WHERE ${ELEGIBLES}
           AND (COALESCE(a.completado_en, a.creado_en) AT TIME ZONE 'America/Mexico_City')::date < $1::date${filtro}
         FOR UPDATE OF a`,
        params
      );
      const ids = r.rows.map(x => x.id);
      if (!soloContar && ids.length) {
        await c.query(
          'INSERT INTO actividades_sin_pago (actividad_id, marcado_por) SELECT UNNEST($1::int[]), $2 ON CONFLICT DO NOTHING',
          [ids, req.usuario.id]
        );
      }
      return ids.length;
    });
    res.json({ cantidad, aplicado: !soloContar });
  } catch (err) { responderError(res, err, 'excluirAnteriores', 'No se pudo completar la operación.'); }
}

module.exports = {
  listarTecnicos, resumen, actividadesPorAgrupar, actividadesFueraDePago,
  listarPagos, obtenerPago,
  crearPago, actualizarPago, cancelarPago, registrarAbono, deshacerAbono,
  excluirActividades, incluirActividades, excluirAnteriores
};
