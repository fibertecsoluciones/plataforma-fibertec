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
  const { nombre, velocidad, precio, costo_instalacion } = req.body;
  if (!nombre || precio === undefined) return res.status(400).json({ error: 'Nombre y precio son obligatorios.' });
  try {
    const r = await db.query(
      'INSERT INTO planes (nombre, velocidad, precio, costo_instalacion) VALUES ($1, $2, $3, COALESCE($4,0)) RETURNING *',
      [nombre.toUpperCase(), velocidad, precio, costo_instalacion]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'No se pudo crear el plan (¿nombre repetido?).' });
  }
}

async function actualizarPlan(req, res) {
  const { id } = req.params;
  const { nombre, velocidad, precio, costo_instalacion } = req.body;
  if (!nombre || precio === undefined) return res.status(400).json({ error: 'Nombre y precio son obligatorios.' });
  try {
    const r = await db.query(
      'UPDATE planes SET nombre = $1, velocidad = $2, precio = $3, costo_instalacion = COALESCE($4,0) WHERE id = $5 RETURNING *',
      [nombre.toUpperCase(), velocidad, precio, costo_instalacion, id]
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
// Devuelve los usuarios. Sin parámetros: solo administradores y técnicos (lo usan las listas para
// asignar actividades). Con ?todos=1 (pantalla de Ajustes): también los de cobranza, con su zona.
async function getTecnicos(req, res) {
  const todos = req.query.todos === '1';
  const r = await db.query(
    `SELECT u.id, u.nombre, u.usuario, u.rol, u.telefono, u.activo, u.zona_id, u.ocultar_montos, z.nombre AS zona_nombre
     FROM usuarios u LEFT JOIN zonas z ON z.id = u.zona_id
     ${todos ? '' : `WHERE u.rol <> 'cobranza'`}
     ORDER BY u.rol, u.nombre`
  );
  res.json(r.rows);
}

const ROLES = ['admin', 'tecnico', 'cobranza'];

// La zona solo aplica al rol cobranza. Devuelve null (todas las zonas) o el id de una zona activa.
async function zonaParaRol(rol, zona_id) {
  if (rol !== 'cobranza' || zona_id === undefined || zona_id === null || zona_id === '') return null;
  const id = Number(zona_id);
  const z = Number.isInteger(id) ? await db.query('SELECT id FROM zonas WHERE id = $1 AND activo = TRUE', [id]) : { rows: [] };
  if (!z.rows[0]) { const e = new Error('La zona elegida no existe.'); e.status = 400; throw e; }
  return id;
}

async function crearUsuario(req, res) {
  const { nombre, usuario, password, rol, telefono, zona_id, ocultar_montos } = req.body;
  if (!nombre || !usuario || !password || !rol) {
    return res.status(400).json({ error: 'Nombre, usuario, password y rol son obligatorios.' });
  }
  if (!ROLES.includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido.' });
  }
  try {
    const zona = await zonaParaRol(rol, zona_id);
    const hash = await bcrypt.hash(password, 10);
    const r = await db.query(
      `INSERT INTO usuarios (nombre, usuario, password_hash, rol, telefono, zona_id, ocultar_montos)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, nombre, usuario, rol, telefono, activo, zona_id, ocultar_montos`,
      [nombre, usuario, hash, rol, telefono, zona, rol === 'cobranza' && ocultar_montos === true]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err.code === '23514') return res.status(400).json({ error: 'Falta correr la migración del rol de cobranza (025) o de ocultar montos (026): node db/migrate.js migrations/026_ocultar_montos.sql' });
    res.status(400).json({ error: 'No se pudo crear el usuario (¿nombre de usuario repetido?).' });
  }
}

// Edita nombre, teléfono, rol, zona y estado activo. La contraseña solo se cambia si se envía.
async function actualizarUsuario(req, res) {
  const { id } = req.params;
  const { nombre, telefono, rol, activo, password, zona_id, ocultar_montos } = req.body;

  const sets = []; const params = [];
  try {
    if (nombre !== undefined) { params.push(nombre); sets.push(`nombre = $${params.length}`); }
    if (telefono !== undefined) { params.push(telefono); sets.push(`telefono = $${params.length}`); }
    if (rol !== undefined) {
      if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido.' });
      params.push(rol); sets.push(`rol = $${params.length}`);
    }
    // La zona se guarda con el rol que quedará (el enviado, o el que ya tiene)
    if (zona_id !== undefined || rol !== undefined) {
      let rolFinal = rol;
      if (rolFinal === undefined) {
        const actual = await db.query('SELECT rol FROM usuarios WHERE id = $1', [id]);
        if (!actual.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
        rolFinal = actual.rows[0].rol;
      }
      params.push(await zonaParaRol(rolFinal, zona_id)); sets.push(`zona_id = $${params.length}`);
    }
    // "Ocultar montos" solo vale para cobranza: si el usuario deja de ser cobranza se apaga
    if (ocultar_montos !== undefined || rol !== undefined) {
      let rolFinal = rol;
      if (rolFinal === undefined) {
        const actual = await db.query('SELECT rol FROM usuarios WHERE id = $1', [id]);
        if (!actual.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
        rolFinal = actual.rows[0].rol;
      }
      if (rolFinal !== 'cobranza') { sets.push('ocultar_montos = FALSE'); }
      else if (ocultar_montos !== undefined) { params.push(ocultar_montos === true); sets.push(`ocultar_montos = $${params.length}`); }
    }
    if (activo !== undefined) { params.push(activo); sets.push(`activo = $${params.length}`); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      params.push(hash); sets.push(`password_hash = $${params.length}`);
    }

    if (!sets.length) return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });

    params.push(id);
    const r = await db.query(
      `UPDATE usuarios SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, nombre, usuario, rol, telefono, activo, zona_id, ocultar_montos`,
      params
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json(r.rows[0]);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    if (err.code === '23514') return res.status(400).json({ error: 'Falta correr la migración del rol de cobranza (025) o de ocultar montos (026): node db/migrate.js migrations/026_ocultar_montos.sql' });
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

async function getIngresosCategorias(req, res) {
  const r = await db.query('SELECT * FROM ingresos_categorias ORDER BY nombre');
  res.json(r.rows);
}

async function getInventarioCategorias(req, res) {
  const r = await db.query('SELECT * FROM inventario_categorias ORDER BY nombre');
  res.json(r.rows);
}

// ---------- AVISO DE FALLAS EN LA PÁGINA WEB ----------
async function getAvisoSitio(req, res) {
  try {
    const r = await db.query('SELECT mensaje, tipo, activo, actualizado_en FROM aviso_sitio WHERE id = 1');
    res.json(r.rows[0] || { mensaje: '', tipo: 'falla', activo: false });
  } catch (err) {
    if (err.code === '42P01') return res.status(500).json({ error: 'Falta correr la migración 028 (aviso del sitio).' });
    throw err;
  }
}

async function guardarAvisoSitio(req, res) {
  const mensaje = String(req.body.mensaje || '').trim().replace(/\s+/g, ' ');
  const tipo = req.body.tipo === 'info' ? 'info' : 'falla';
  const activo = req.body.activo === true;
  if (mensaje.length > 250) return res.status(400).json({ error: 'El aviso puede tener máximo 250 caracteres.' });
  if (activo && !mensaje) return res.status(400).json({ error: 'Escribe el mensaje del aviso antes de publicarlo.' });
  try {
    const r = await db.query(
      `INSERT INTO aviso_sitio (id, mensaje, tipo, activo, actualizado_en) VALUES (1, $1, $2, $3, NOW())
       ON CONFLICT (id) DO UPDATE SET mensaje = $1, tipo = $2, activo = $3, actualizado_en = NOW()
       RETURNING mensaje, tipo, activo, actualizado_en`,
      [mensaje, tipo, activo]
    );
    res.json(r.rows[0]);
  } catch (err) {
    if (err.code === '42P01') return res.status(500).json({ error: 'Falta correr la migración 028 (aviso del sitio).' });
    throw err;
  }
}

module.exports = {
  getAvisoSitio, guardarAvisoSitio,
  getZonas, crearZona, actualizarZona, eliminarZona,
  getPlanes, crearPlan, actualizarPlan, eliminarPlan,
  getTecnicos, crearUsuario, actualizarUsuario, eliminarUsuario,
  getEgresosCategorias, getIngresosCategorias, getInventarioCategorias
};
