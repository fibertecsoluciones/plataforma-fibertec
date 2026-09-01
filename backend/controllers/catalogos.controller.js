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

// ---------- TÉCNICOS / USUARIOS ----------
async function getTecnicos(req, res) {
  const r = await db.query(
    `SELECT id, nombre, usuario, rol, telefono, activo FROM usuarios WHERE rol = 'tecnico' ORDER BY nombre`
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
  getZonas, crearZona,
  getPlanes, crearPlan,
  getTecnicos, crearUsuario,
  getEgresosCategorias, getInventarioCategorias
};
