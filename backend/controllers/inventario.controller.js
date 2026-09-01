const db = require('../config/db');

async function listarItems(req, res) {
  const r = await db.query(
    `SELECT i.*, cat.nombre AS categoria_nombre
     FROM inventario_items i
     LEFT JOIN inventario_categorias cat ON cat.id = i.categoria_id
     ORDER BY i.nombre`
  );
  res.json(r.rows);
}

async function crearItem(req, res) {
  const { nombre, categoria_id, unidad, stock_actual, stock_minimo, ubicacion, notas } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre del artículo es obligatorio.' });

  const r = await db.query(
    `INSERT INTO inventario_items (nombre, categoria_id, unidad, stock_actual, stock_minimo, ubicacion, notas)
     VALUES ($1,$2,COALESCE($3,'pza'),COALESCE($4,0),COALESCE($5,0),$6,$7) RETURNING *`,
    [nombre, categoria_id || null, unidad, stock_actual, stock_minimo, ubicacion, notas]
  );
  res.status(201).json(r.rows[0]);
}

async function actualizarItem(req, res) {
  const { id } = req.params;
  const campos = ['nombre','categoria_id','unidad','stock_minimo','ubicacion','notas'];
  const sets = []; const params = [];
  campos.forEach((c) => {
    if (req.body[c] !== undefined) { params.push(req.body[c]); sets.push(`${c} = $${params.length}`); }
  });
  if (!sets.length) return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
  params.push(id);
  const r = await db.query(`UPDATE inventario_items SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!r.rows[0]) return res.status(404).json({ error: 'Artículo no encontrado.' });
  res.json(r.rows[0]);
}

// Registrar entrada o salida de inventario (el stock se actualiza automáticamente vía trigger)
async function registrarMovimiento(req, res) {
  const { item_id, tipo, cantidad, motivo, cliente_id } = req.body;
  if (!item_id || !tipo || !cantidad) {
    return res.status(400).json({ error: 'Artículo, tipo (entrada/salida) y cantidad son obligatorios.' });
  }
  if (!['entrada', 'salida'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo inválido, debe ser "entrada" o "salida".' });
  }

  try {
    const r = await db.query(
      `INSERT INTO inventario_movimientos (item_id, tipo, cantidad, motivo, tecnico_id, cliente_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [item_id, tipo, cantidad, motivo, req.usuario?.id || null, cliente_id || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo registrar el movimiento.' });
  }
}

async function listarMovimientos(req, res) {
  const { itemId } = req.query;
  let sql = `
    SELECT m.*, i.nombre AS item_nombre, u.nombre AS tecnico_nombre
    FROM inventario_movimientos m
    JOIN inventario_items i ON i.id = m.item_id
    LEFT JOIN usuarios u ON u.id = m.tecnico_id
    WHERE 1=1`;
  const params = [];
  if (itemId) { params.push(itemId); sql += ` AND m.item_id = $${params.length}`; }
  sql += ' ORDER BY m.fecha DESC LIMIT 200';
  const r = await db.query(sql, params);
  res.json(r.rows);
}

module.exports = { listarItems, crearItem, actualizarItem, registrarMovimiento, listarMovimientos };
