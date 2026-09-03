const db = require('../config/db');

// Calcula el día de pago automático a partir de la fecha/hora de la instalación,
// usando la hora de México (independientemente de en qué zona horaria corra el
// servidor de Railway). Regla: si ya son las 5:00 PM o después, se usa el día
// siguiente (para no cobrarle "el mismo día" a alguien instalado ya entrada la tarde).
function calcularDiaDePagoAutomatico() {
  const ahora = new Date();
  const zona = 'America/Mexico_City';

  const horaLocal = Number(new Intl.DateTimeFormat('en-US', { timeZone: zona, hour: 'numeric', hour12: false }).format(ahora));

  let instanteBase = ahora;
  if (horaLocal >= 17) {
    instanteBase = new Date(ahora.getTime() + 24 * 60 * 60 * 1000); // +1 día
  }

  const dia = Number(new Intl.DateTimeFormat('en-US', { timeZone: zona, day: 'numeric' }).format(instanteBase));
  return dia;
}

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
    // ¿Es la primera instalación que se le registra a este cliente? (se checa ANTES de insertar la nueva)
    const previasRes = await db.query('SELECT COUNT(*)::int AS total FROM instalaciones WHERE cliente_id = $1', [cliente_id]);
    const esPrimeraInstalacion = previasRes.rows[0].total === 0;

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

    // Solo en la PRIMERA instalación de un cliente se le asigna el día de pago
    // automáticamente (para no pisar el ciclo de cobro de alguien que ya es cliente
    // y solo le están cambiando el módem o dándole mantenimiento).
    let diaPagoAsignado = null;
    if (esPrimeraInstalacion) {
      diaPagoAsignado = calcularDiaDePagoAutomatico();
      await db.query('UPDATE clientes SET dia_pago = $1 WHERE id = $2', [diaPagoAsignado, cliente_id]);
    }

    res.status(201).json({ ...r.rows[0], dia_pago_asignado: diaPagoAsignado });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo registrar la instalación.' });
  }
}

// Edita los datos técnicos de una instalación ya registrada (admin). La fecha, el
// técnico y el cliente NO se pueden cambiar aquí — son el registro histórico de quién
// hizo qué y cuándo; si algo de eso está mal, lo correcto es borrar y volver a capturar.
async function actualizarInstalacion(req, res) {
  const { id } = req.params;
  const { ip_asignada, mac_modem, marca_modem, modelo_modem, serial_modem, notas } = req.body;

  const sets = ['ip_asignada = $1', 'mac_modem = $2', 'marca_modem = $3', 'modelo_modem = $4', 'serial_modem = $5', 'notas = $6'];
  const params = [ip_asignada, mac_modem, marca_modem, modelo_modem, serial_modem, notas];

  if (req.file) {
    params.push(`/uploads/evidencias/${req.file.filename}`);
    sets.push(`evidencia_url = $${params.length}`);
  }

  params.push(id);

  try {
    const r = await db.query(
      `UPDATE instalaciones SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Instalación no encontrada.' });

    // Si editó la IP, también se actualiza en la ficha del cliente (igual que al crearla)
    if (ip_asignada) {
      await db.query('UPDATE clientes SET ip = $1 WHERE id = $2', [ip_asignada, r.rows[0].cliente_id]);
    }

    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo actualizar la instalación.' });
  }
}

// Elimina un registro de instalación (solo admin). No borra el archivo de evidencia
// del disco (queda huérfano mientras no se limpie el volumen), pero eso no afecta
// el uso normal del sistema.
async function eliminarInstalacion(req, res) {
  const { id } = req.params;
  const r = await db.query('DELETE FROM instalaciones WHERE id = $1 RETURNING *', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Instalación no encontrada.' });
  res.json({ mensaje: 'Instalación eliminada.', instalacion: r.rows[0] });
}

module.exports = { listarInstalaciones, obtenerInstalacionesDeCliente, registrarInstalacion, actualizarInstalacion, eliminarInstalacion };
