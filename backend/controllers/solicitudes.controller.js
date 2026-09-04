const db = require('../config/db');

async function listarSolicitudes(req, res) {
  const { estado } = req.query;
  let sql = `
    SELECT s.*, z.nombre AS zona_nombre, p.nombre AS plan_nombre, u.nombre AS capturado_por_nombre,
           c.cliente_id AS cliente_generado_folio
    FROM solicitudes_instalacion s
    LEFT JOIN zonas z ON z.id = s.zona_id
    LEFT JOIN planes p ON p.id = s.plan_interes_id
    LEFT JOIN usuarios u ON u.id = s.capturado_por
    LEFT JOIN clientes c ON c.id = s.cliente_generado_id
    WHERE 1=1`;
  const params = [];

  if (estado) {
    params.push(estado);
    sql += ` AND s.estado = $${params.length}`;
  }

  sql += ` ORDER BY s.estado = 'nueva' DESC, s.estado = 'contactada' DESC, s.estado = 'agendada' DESC, s.creado_en DESC`;

  const r = await db.query(sql, params);
  res.json(r.rows);
}

async function obtenerSolicitud(req, res) {
  const { id } = req.params;
  const r = await db.query(
    `SELECT s.*, z.nombre AS zona_nombre, p.nombre AS plan_nombre, u.nombre AS capturado_por_nombre
     FROM solicitudes_instalacion s
     LEFT JOIN zonas z ON z.id = s.zona_id
     LEFT JOIN planes p ON p.id = s.plan_interes_id
     LEFT JOIN usuarios u ON u.id = s.capturado_por
     WHERE s.id = $1`,
    [id]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  res.json(r.rows[0]);
}

// Captura rápida desde campo (técnico o admin). Solo el nombre es obligatorio —
// todo lo demás se puede completar después, al convertirla en cliente.
async function crearSolicitud(req, res) {
  const { nombre, telefono, telefono_alt, direccion, zona_id, plan_interes_id, notas, latitud, longitud } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre del prospecto es obligatorio.' });
  }

  const r = await db.query(
    `INSERT INTO solicitudes_instalacion
      (nombre, telefono, telefono_alt, direccion, zona_id, plan_interes_id, notas, capturado_por, latitud, longitud)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [nombre.trim(), telefono, telefono_alt, direccion, zona_id || null, plan_interes_id || null, notas, req.usuario.id, latitud || null, longitud || null]
  );
  res.status(201).json(r.rows[0]);
}

// Edita datos generales o cambia el estado (contactada/agendada/descartada) — admin.
async function actualizarSolicitud(req, res) {
  const { id } = req.params;
  const campos = ['nombre','telefono','telefono_alt','direccion','zona_id','plan_interes_id','notas','estado'];
  const sets = []; const params = [];

  campos.forEach((campo) => {
    if (req.body[campo] !== undefined) {
      params.push(req.body[campo] === '' ? null : req.body[campo]);
      sets.push(`${campo} = $${params.length}`);
    }
  });

  if (!sets.length) return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });

  params.push(id);
  const r = await db.query(`UPDATE solicitudes_instalacion SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!r.rows[0]) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  res.json(r.rows[0]);
}

// Convierte una solicitud en un Cliente formal (con folio, plan, día de pago reales).
// Crea el cliente, liga la solicitud a él, y la marca como "convertida" — todo junto.
async function convertirACliente(req, res) {
  const { id } = req.params;
  const {
    nombre, telefono, telefono_alt, direccion, zona_id, plan_id, ip, dia_pago, dias_tolerancia, notas,
    crear_actividad_instalacion, tecnico_instalador_id
  } = req.body;

  if (!nombre || !zona_id || !plan_id || !dia_pago) {
    return res.status(400).json({ error: 'Nombre, zona, plan y día de pago son obligatorios para dar de alta al cliente.' });
  }
  if (crear_actividad_instalacion && !tecnico_instalador_id) {
    return res.status(400).json({ error: 'Si quieres crear la actividad de instalación, elige a qué técnico se le asigna.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const solicitudRes = await client.query('SELECT * FROM solicitudes_instalacion WHERE id = $1 FOR UPDATE', [id]);
    const solicitud = solicitudRes.rows[0];
    if (!solicitud) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Solicitud no encontrada.' }); }
    if (solicitud.estado === 'convertida') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Esta solicitud ya fue convertida en cliente antes.' }); }

    const clienteRes = await client.query(
      `INSERT INTO clientes (nombre, telefono, telefono_alt, direccion, zona_id, plan_id, ip, dia_pago, dias_tolerancia, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,5),$10)
       RETURNING *`,
      [nombre, telefono, telefono_alt, direccion, zona_id, plan_id, ip, dia_pago, dias_tolerancia, notas]
    );
    const cliente = clienteRes.rows[0];

    await client.query(
      `UPDATE solicitudes_instalacion SET estado = 'convertida', cliente_generado_id = $1 WHERE id = $2`,
      [cliente.id, id]
    );

    let actividadCreada = null;
    if (crear_actividad_instalacion && tecnico_instalador_id) {
      const actRes = await client.query(
        `INSERT INTO actividades (titulo, descripcion, tecnico_id, cliente_id, prioridad, creado_por)
         VALUES ($1,$2,$3,$4,'alta',$5) RETURNING *`,
        [`Instalar a ${nombre}`, `Nuevo cliente convertido desde una solicitud de campo. Folio: ${cliente.cliente_id}.`, tecnico_instalador_id, cliente.id, req.usuario.id]
      );
      actividadCreada = actRes.rows[0];
    }

    await client.query('COMMIT');
    res.status(201).json({
      mensaje: `Cliente creado con folio ${cliente.cliente_id}.${actividadCreada ? ' Se creó también la actividad de instalación.' : ''}`,
      cliente, actividad: actividadCreada
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'No se pudo convertir la solicitud en cliente.' });
  } finally {
    client.release();
  }
}

async function eliminarSolicitud(req, res) {
  const { id } = req.params;
  const r = await db.query('DELETE FROM solicitudes_instalacion WHERE id = $1 RETURNING *', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  res.json({ mensaje: 'Solicitud eliminada.' });
}

module.exports = {
  listarSolicitudes, obtenerSolicitud, crearSolicitud,
  actualizarSolicitud, convertirACliente, eliminarSolicitud
};
