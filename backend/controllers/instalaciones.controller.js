const db = require('../config/db');

async function listarInstalaciones(req, res) {
  const r = await db.query(
    `SELECT i.*, c.cliente_id AS folio, c.nombre AS cliente_nombre, u.nombre AS tecnico_nombre
     FROM instalaciones i
     JOIN clientes c ON c.id = i.cliente_id
     JOIN usuarios u ON u.id = i.tecnico_id
     ORDER BY i.fecha_instalacion DESC`
  );
  res.json(r.rows);
}

async function obtenerInstalacionesDeCliente(req, res) {
  const { clienteId } = req.params;
  const r = await db.query(
    `SELECT i.*, u.nombre AS tecnico_nombre
     FROM instalaciones i JOIN usuarios u ON u.id = i.tecnico_id
     WHERE i.cliente_id = $1 ORDER BY i.fecha_instalacion DESC`,
    [clienteId]
  );
  res.json(r.rows);
}

// Registrar una instalación. La fecha y el técnico se toman del servidor/sesión,
// no del formulario, para evitar datos falsos. La ubicación (lat/long) viene del
// navegador del técnico (geolocalización) y se recibe ya capturada desde el frontend.
async function registrarInstalacion(req, res) {
  const {
    cliente_id, ip_asignada, mac_modem, marca_modem, modelo_modem, serial_modem,
    latitud, longitud, direccion_aprox, notas
  } = req.body;

  if (!cliente_id) {
    return res.status(400).json({ error: 'Falta el cliente (busca primero por su folio).' });
  }

  const tecnico_id = req.usuario.id; // tomado de la sesión del técnico logueado
  const evidencia_url = req.file ? `/uploads/evidencias/${req.file.filename}` : null;

  try {
    const r = await db.query(
      `INSERT INTO instalaciones
        (cliente_id, tecnico_id, ip_asignada, mac_modem, marca_modem, modelo_modem, serial_modem,
         evidencia_url, latitud, longitud, direccion_aprox, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [cliente_id, tecnico_id, ip_asignada, mac_modem, marca_modem, modelo_modem, serial_modem,
       evidencia_url, latitud || null, longitud || null, direccion_aprox, notas]
    );

    // Si se capturó la IP asignada, actualizamos también el registro del cliente
    if (ip_asignada) {
      await db.query('UPDATE clientes SET ip = $1 WHERE id = $2', [ip_asignada, cliente_id]);
    }

    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo registrar la instalación.' });
  }
}

module.exports = { listarInstalaciones, obtenerInstalacionesDeCliente, registrarInstalacion };
