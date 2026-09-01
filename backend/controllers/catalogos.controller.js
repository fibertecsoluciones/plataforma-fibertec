const bcrypt = require('bcryptjs');
const db = require('../config/db');

// ---------- ZONAS ----------
async function getZonas(req, res) {
  const r = await db.query('SELECT * FROM zonas WHERE activo = TRUE ORDER BY nombre');
  res.json(r.rows);
}

async function crearZona(req, res) {
  const { nombre, codigo } = req.body;
  if (!nombre || !codigo) return res.status(400).json({ error: 'Nombre y código son obligatorios.' });
  try {
    const r = await db.query(
      'INSERT INTO zonas (nombre, codigo) VALUES ($1, $2) RETURNING *',
      [nombre.toUpperCase(), codigo.toUpperCase()]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'No se pudo crear la zona (¿nombre o código repetido?).' });
  }
}

async function actualizarZona(req, res) {
  const { id } = req.params;
  const { nombre, codigo } = req.body;
  if (!nombre || !codigo) return res.status(400).json({ error: 'Nombre y código son obligatorios.' });
  try {
    const r = await db.query(
      'UPDATE zonas SET nombre = $1, codigo = $2 WHERE id = $3 RETURNING *',
      [nombre.toUpperCase(), codigo.toUpperCase(), id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Zona no encontrada.' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'No se pudo actualizar la zona (¿nombre o código repetido?).' });
  }
}

// No se borra físicamente: hay clientes que dependen de la zona (FK). Se marca como inactiva
// para que deje de aparecer en los formularios, sin perder el historial de esos clientes.
async function eliminarZona(req, res) {
  const { id } = req.params;
  const r = await db.query('UPDATE zonas SET activo = FALSE WHERE id = $1 RETURNING *', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Zona no encontrada.' });
  res.json({ mensaje: 'Zona desactivada.', zona: r.rows[0] });
}

// ---------- PLANES ----------
async function getPlanes(req, res) {
  const r = await db.query('SELECT * FROM planes WHERE activo = TRUE ORDER BY nombre');
  res.json(r.rows);
}

async function crearPlan(req, res) {
  const { nombre, velocidad, precio } = req.body;
  if (!nombre || precio === undefined) return res.status(400).json({ error: 'Nombre y precio son obligatorios.' });
  try {
    const r = await db.query(
      'INSERT INTO planes (nombre, velocidad, precio) VALUES ($1, $2, $3) RETURNING *',
      [nombre.toUpperCase(), velocidad, precio]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'No se pudo crear el plan (¿nombre repetido?).' });
  }
}

async function actualizarPlan(req, res) {
  const { id } = req.params;
  const { nombre, velocidad, precio } = req.body;
  if (!nombre || precio === undefined) return res.status(400).json({ error: 'Nombre y precio son obligatorios.' });
  try {
    const r = await db.query(
      'UPDATE planes SET nombre = $1, velocidad = $2, precio = $3 WHERE id = $4 RETURNING *',
      [nombre.toUpperCase(), velocidad, precio, id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Plan no encontrado.' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'No se pudo actualizar el plan (¿nombre repetido?).' });
  }
}

// Igual que zonas: no se borra físicamente porque hay clientes con ese plan (FK).
async function eliminarPlan(req, res) {
  const { id } = req.params;
  const r = await db.query('UPDATE planes SET activo = FALSE WHERE id = $1 RETURNING *', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Plan no encontrado.' });
  res.json({ mensaje: 'Plan desactivado.', plan: r.rows[0] });
}

// ---------- TÉCNICOS / USUARIOS ----------
// Devuelve TODOS los usuarios (admins y técnicos), no solo técnicos.
async function getTecnicos(req, res) {
  const r = await db.query(
    `SELECT id, nombre, usuario, rol, telefono, activo FROM usuarios ORDER BY rol, nombre`
  );
  res.json(r.rows);
}

async function crearUsuario(req, res) {
  const { nombre, usuario, password, rol, telefono } = req.body;
  if (!nombre || !usuario || !password || !rol) {
    return res.status(400).json({ error: 'Nombre, usuario, password y rol son obligatorios.' });
  }
  if (!['admin', 'tecnico'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido.' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const r = await db.query(
      `INSERT INTO usuarios (nombre, usuario, password_hash, rol, telefono)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, nombre, usuario, rol, telefono, activo`,
      [nombre, usuario, hash, rol, telefono]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'No se pudo crear el usuario (¿nombre de usuario repetido?).' });
  }
}

// Edita nombre, teléfono, rol y estado activo. La contraseña solo se cambia si se envía.
async function actualizarUsuario(req, res) {
  const { id } = req.params;
  const { nombre, telefono, rol, activo, password } = req.body;

  const sets = []; const params = [];
  if (nombre !== undefined) { params.push(nombre); sets.push(`nombre = $${params.length}`); }
  if (telefono !== undefined) { params.push(telefono); sets.push(`telefono = $${params.length}`); }
  if (rol !== undefined) {
    if (!['admin', 'tecnico'].includes(rol)) return res.status(400).json({ error: 'Rol inválido.' });
    params.push(rol); sets.push(`rol = $${params.length}`);
  }
  if (activo !== undefined) { params.push(activo); sets.push(`activo = $${params.length}`); }
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    params.push(hash); sets.push(`password_hash = $${params.length}`);
  }

  if (!sets.length) return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });

  params.push(id);
  try {
    const r = await db.query(
      `UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, nombre, usuario, rol, telefono, activo`,
      params
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'No se pudo actualizar el usuario.' });
  }
}

// No se borra físicamente: hay pagos/instalaciones que quedaron registrados por este usuario (FK).
// Se desactiva para que ya no pueda iniciar sesión ni aparezca disponible para nuevas asignaciones.
async function eliminarUsuario(req, res) {
  const { id } = req.params;
  if (req.usuario && Number(req.usuario.id) === Number(id)) {
    return res.status(400).json({ error: 'No puedes desactivar tu propio usuario mientras tienes la sesión abierta.' });
  }
  const r = await db.query(
    'UPDATE usuarios SET activo = FALSE WHERE id = $1 RETURNING id, nombre, usuario, rol, telefono, activo',
    [id]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json({ mensaje: 'Usuario desactivado.', usuario: r.rows[0] });
}

// ---------- CATEGORÍAS DE EGRESOS / INVENTARIO ----------
async function getEgresosCategorias(req, res) {
  const r = await db.query('SELECT * FROM egresos_categorias ORDER BY nombre');
  res.json(r.rows);
}

async function getInventarioCategorias(req, res) {
  const r = await db.query('SELECT * FROM inventario_categorias ORDER BY nombre');
  res.json(r.rows);
}

module.exports = {
  getZonas, crearZona, actualizarZona, eliminarZona,
  getPlanes, crearPlan, actualizarPlan, eliminarPlan,
  getTecnicos, crearUsuario, actualizarUsuario, eliminarUsuario,
  getEgresosCategorias, getInventarioCategorias
};
