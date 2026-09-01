const db = require('../config/db');

// Lista de clientes con su estado de pago (semáforo) - para el dashboard general
async function listarClientes(req, res) {
  const { zona, estado, semaforo, q } = req.query;

  let sql = `SELECT * FROM vw_estado_pago WHERE 1=1`;
  const params = [];

  if (zona) {
    params.push(zona);
    sql += ` AND zona = $${params.length}`;
  }
  if (estado) {
    params.push(estado);
    sql += ` AND estado_cliente = $${params.length}`;
  }
  if (semaforo) {
    params.push(semaforo);
    sql += ` AND semaforo = $${params.length}`;
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    sql += ` AND (LOWER(nombre) LIKE $${params.length} OR LOWER(cliente_id) LIKE $${params.length} OR ip LIKE $${params.length})`;
  }

  sql += ' ORDER BY semaforo = \'rojo\' DESC, semaforo = \'naranja\' DESC, semaforo = \'amarillo\' DESC, nombre ASC';

  const r = await db.query(sql, params);
  res.json(r.rows);
}

// Detalle completo de un cliente (para edición)
async function obtenerCliente(req, res) {
  const { id } = req.params;
  const r = await db.query(
    `SELECT c.*, z.nombre AS zona_nombre, pl.nombre AS plan_nombre, pl.precio
     FROM clientes c
     JOIN zonas z ON z.id = c.zona_id
     JOIN planes pl ON pl.id = c.plan_id
     WHERE c.id = $1`,
    [id]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado.' });
  res.json(r.rows[0]);
}

// Búsqueda por Cliente-ID (folio) — usada por los técnicos para autocompletar el formulario
async function buscarPorFolio(req, res) {
  const { folio } = req.params;
  const r = await db.query(
    `SELECT c.*, z.nombre AS zona_nombre, pl.nombre AS plan_nombre, pl.precio
     FROM clientes c
     JOIN zonas z ON z.id = c.zona_id
     JOIN planes pl ON pl.id = c.plan_id
     WHERE UPPER(c.cliente_id) = UPPER($1)`,
    [folio]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'No existe ningún cliente con ese folio (Cliente-ID).' });
  res.json(r.rows[0]);
}

async function crearCliente(req, res) {
  const { nombre, telefono, telefono_alt, direccion, zona_id, plan_id, ip, dia_pago, dias_tolerancia, notas } = req.body;

  if (!nombre || !zona_id || !plan_id || !dia_pago) {
    return res.status(400).json({ error: 'Nombre, zona, plan y día de pago son obligatorios.' });
  }
  if (dia_pago < 1 || dia_pago > 31) {
    return res.status(400).json({ error: 'El día de pago debe estar entre 1 y 31.' });
  }

  try {
    const r = await db.query(
      `INSERT INTO clientes
        (nombre, telefono, telefono_alt, direccion, zona_id, plan_id, ip, dia_pago, dias_tolerancia, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,5),$10)
       RETURNING *`,
      [nombre, telefono, telefono_alt, direccion, zona_id, plan_id, ip, dia_pago, dias_tolerancia, notas]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'No se pudo crear el cliente. Revisa los datos enviados.' });
  }
}

async function actualizarCliente(req, res) {
  const { id } = req.params;
  const campos = ['nombre','telefono','telefono_alt','direccion','zona_id','plan_id','ip','dia_pago','dias_tolerancia','estado','notas'];
  const sets = [];
  const params = [];

  campos.forEach((campo) => {
    if (req.body[campo] !== undefined) {
      params.push(req.body[campo]);
      sets.push(`${campo} = $${params.length}`);
    }
  });

  if (sets.length === 0) return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });

  params.push(id);
  const sql = `UPDATE clientes SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`;

  try {
    const r = await db.query(sql, params);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'No se pudo actualizar el cliente.' });
  }
}

async function eliminarCliente(req, res) {
  const { id } = req.params;
  // Baja lógica, no se borra físicamente (se conserva el historial de pagos)
  const r = await db.query(`UPDATE clientes SET estado = 'baja' WHERE id = $1 RETURNING *`, [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado.' });
  res.json({ mensaje: 'Cliente dado de baja.', cliente: r.rows[0] });
}

// Resumen de conteos por semáforo, para tarjetas del dashboard
async function resumenSemaforo(req, res) {
  const r = await db.query(`SELECT semaforo, COUNT(*)::int AS total FROM vw_estado_pago GROUP BY semaforo`);
  const base = { verde: 0, amarillo: 0, naranja: 0, rojo: 0 };
  r.rows.forEach((row) => { base[row.semaforo] = row.total; });
  res.json(base);
}

module.exports = {
  listarClientes, obtenerCliente, buscarPorFolio,
  crearCliente, actualizarCliente, eliminarCliente,
  resumenSemaforo
};
