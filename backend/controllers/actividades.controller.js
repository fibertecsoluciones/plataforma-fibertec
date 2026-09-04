const db = require('../config/db');

// Lista actividades. Admin ve todas (con filtros opcionales); técnico solo ve las suyas.
async function listarActividades(req, res) {
  const { tecnicoId, estado } = req.query;
  const esAdmin = req.usuario.rol === 'admin';

  let sql = `
    SELECT a.*, u.nombre AS tecnico_nombre, cu.nombre AS creado_por_nombre,
           c.cliente_id AS cliente_folio, c.nombre AS cliente_nombre,
           COUNT(p.id)::int AS total_puntos,
           COUNT(p.id) FILTER (WHERE p.completado)::int AS puntos_completados,
           inst.fecha_instalacion AS instalacion_relacionada_fecha
    FROM actividades a
    JOIN usuarios u ON u.id = a.tecnico_id
    LEFT JOIN usuarios cu ON cu.id = a.creado_por
    LEFT JOIN clientes c ON c.id = a.cliente_id
    LEFT JOIN actividad_puntos p ON p.actividad_id = a.id
    LEFT JOIN LATERAL (
      SELECT fecha_instalacion FROM instalaciones
      WHERE cliente_id = a.cliente_id AND tecnico_id = a.tecnico_id AND fecha_instalacion >= a.creado_en
      ORDER BY fecha_instalacion DESC LIMIT 1
    ) inst ON a.cliente_id IS NOT NULL
    WHERE 1=1`;
  const params = [];

  if (!esAdmin) {
    // Un técnico solo puede ver sus propias actividades, sin importar qué le manden por query.
    params.push(req.usuario.id);
    sql += ` AND a.tecnico_id = $${params.length}`;
  } else if (tecnicoId) {
    params.push(tecnicoId);
    sql += ` AND a.tecnico_id = $${params.length}`;
  }

  if (estado) {
    params.push(estado);
    sql += ` AND a.estado = $${params.length}`;
  }

  sql += ` GROUP BY a.id, u.nombre, cu.nombre, c.cliente_id, c.nombre, inst.fecha_instalacion
           ORDER BY
             a.estado = 'pendiente' DESC, a.estado = 'en_proceso' DESC,
             a.prioridad = 'alta' DESC, a.prioridad = 'media' DESC,
             a.fecha_limite ASC NULLS LAST, a.creado_en DESC`;

  const r = await db.query(sql, params);
  res.json(r.rows);
}

// Detalle de una actividad, con su checklist de puntos.
async function obtenerActividad(req, res) {
  const { id } = req.params;
  const esAdmin = req.usuario.rol === 'admin';

  const actividadRes = await db.query(
    `SELECT a.*, u.nombre AS tecnico_nombre, cu.nombre AS creado_por_nombre,
            c.cliente_id AS cliente_folio, c.nombre AS cliente_nombre,
            inst.fecha_instalacion AS instalacion_relacionada_fecha
     FROM actividades a
     JOIN usuarios u ON u.id = a.tecnico_id
     LEFT JOIN usuarios cu ON cu.id = a.creado_por
     LEFT JOIN clientes c ON c.id = a.cliente_id
     LEFT JOIN LATERAL (
       SELECT fecha_instalacion FROM instalaciones
       WHERE cliente_id = a.cliente_id AND tecnico_id = a.tecnico_id AND fecha_instalacion >= a.creado_en
       ORDER BY fecha_instalacion DESC LIMIT 1
     ) inst ON a.cliente_id IS NOT NULL
     WHERE a.id = $1`,
    [id]
  );
  const actividad = actividadRes.rows[0];
  if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada.' });
  if (!esAdmin && actividad.tecnico_id !== req.usuario.id) {
    return res.status(403).json({ error: 'No tienes permiso para ver esta actividad.' });
  }

  const puntosRes = await db.query(
    `SELECT * FROM actividad_puntos WHERE actividad_id = $1 ORDER BY orden ASC, id ASC`,
    [id]
  );

  res.json({ ...actividad, puntos: puntosRes.rows });
}

// Crea una actividad (solo admin), con su checklist de puntos opcional.
async function crearActividad(req, res) {
  const { titulo, descripcion, tecnico_id, cliente_id, cliente_folio, prioridad, fecha_limite, puntos } = req.body;

  if (!titulo || !tecnico_id) {
    return res.status(400).json({ error: 'Título y técnico asignado son obligatorios.' });
  }

  // Se puede ligar el cliente por su id o directo por su folio (más cómodo desde el formulario)
  let clienteIdResuelto = cliente_id || null;
  if (!clienteIdResuelto && cliente_folio && cliente_folio.trim()) {
    const clienteRes = await db.query('SELECT id FROM clientes WHERE UPPER(cliente_id) = UPPER($1)', [cliente_folio.trim()]);
    if (!clienteRes.rows[0]) {
      return res.status(400).json({ error: `No existe ningún cliente con el folio "${cliente_folio}".` });
    }
    clienteIdResuelto = clienteRes.rows[0].id;
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query(
      `INSERT INTO actividades (titulo, descripcion, tecnico_id, cliente_id, prioridad, fecha_limite, creado_por)
       VALUES ($1,$2,$3,$4,COALESCE($5,'media'),$6,$7)
       RETURNING *`,
      [titulo, descripcion, tecnico_id, clienteIdResuelto, prioridad, fecha_limite || null, req.usuario.id]
    );
    const actividad = r.rows[0];

    const listaPuntos = Array.isArray(puntos) ? puntos.filter(p => p && String(p).trim()) : [];
    for (let i = 0; i < listaPuntos.length; i++) {
      await client.query(
        `INSERT INTO actividad_puntos (actividad_id, descripcion, orden) VALUES ($1,$2,$3)`,
        [actividad.id, String(listaPuntos[i]).trim(), i]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ mensaje: 'Actividad creada.', actividad });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'No se pudo crear la actividad.' });
  } finally {
    client.release();
  }
}

// Edita los datos generales de una actividad (solo admin). No toca los puntos aquí.
async function actualizarActividad(req, res) {
  const { id } = req.params;
  const campos = ['titulo', 'descripcion', 'tecnico_id', 'cliente_id', 'prioridad', 'fecha_limite'];
  const sets = []; const params = [];

  campos.forEach((campo) => {
    if (req.body[campo] !== undefined) {
      params.push(req.body[campo] === '' ? null : req.body[campo]);
      sets.push(`${campo} = $${params.length}`);
    }
  });

  if (!sets.length) return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });

  params.push(id);
  const r = await db.query(`UPDATE actividades SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!r.rows[0]) return res.status(404).json({ error: 'Actividad no encontrada.' });
  res.json(r.rows[0]);
}

// Marca una actividad SIN checklist como completada o pendiente (a mano).
// Cualquiera de los dos (admin o el técnico asignado) puede usarlo.
async function marcarEstadoActividad(req, res) {
  const { id } = req.params;
  const { estado } = req.body;
  if (!['pendiente', 'en_proceso', 'completada'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }

  const actividadRes = await db.query('SELECT * FROM actividades WHERE id = $1', [id]);
  const actividad = actividadRes.rows[0];
  if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada.' });
  if (req.usuario.rol !== 'admin' && actividad.tecnico_id !== req.usuario.id) {
    return res.status(403).json({ error: 'No tienes permiso para modificar esta actividad.' });
  }

  const r = await db.query(
    `UPDATE actividades SET estado = $1, completado_en = CASE WHEN $1 = 'completada' THEN now() ELSE NULL END
     WHERE id = $2 RETURNING *`,
    [estado, id]
  );
  res.json(r.rows[0]);
}

async function eliminarActividad(req, res) {
  const { id } = req.params;
  const r = await db.query('DELETE FROM actividades WHERE id = $1 RETURNING *', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Actividad no encontrada.' });
  res.json({ mensaje: 'Actividad eliminada.' });
}

// ---------- PUNTOS (checklist) ----------

// Agrega un punto nuevo a una actividad ya existente (solo admin).
async function agregarPunto(req, res) {
  const { id } = req.params; // id de la actividad
  const { descripcion } = req.body;
  if (!descripcion || !descripcion.trim()) return res.status(400).json({ error: 'La descripción del punto es obligatoria.' });

  const ordenRes = await db.query('SELECT COALESCE(MAX(orden), -1) + 1 AS siguiente FROM actividad_puntos WHERE actividad_id = $1', [id]);
  const r = await db.query(
    `INSERT INTO actividad_puntos (actividad_id, descripcion, orden) VALUES ($1,$2,$3) RETURNING *`,
    [id, descripcion.trim(), ordenRes.rows[0].siguiente]
  );
  res.status(201).json(r.rows[0]);
}

// Marca/desmarca un punto del checklist. Lo puede hacer el técnico asignado o el admin.
async function marcarPunto(req, res) {
  const { id } = req.params; // id del punto
  const { completado } = req.body;

  const puntoRes = await db.query(
    `SELECT p.*, a.tecnico_id FROM actividad_puntos p JOIN actividades a ON a.id = p.actividad_id WHERE p.id = $1`,
    [id]
  );
  const punto = puntoRes.rows[0];
  if (!punto) return res.status(404).json({ error: 'Punto no encontrado.' });
  if (req.usuario.rol !== 'admin' && punto.tecnico_id !== req.usuario.id) {
    return res.status(403).json({ error: 'No tienes permiso para marcar este punto.' });
  }

  const r = await db.query(
    `UPDATE actividad_puntos SET completado = $1, completado_en = CASE WHEN $1 THEN now() ELSE NULL END,
     completado_por = CASE WHEN $1 THEN $2 ELSE NULL END
     WHERE id = $3 RETURNING *`,
    [!!completado, req.usuario.id, id]
  );
  res.json(r.rows[0]);
}

async function eliminarPunto(req, res) {
  const { id } = req.params;
  const r = await db.query('DELETE FROM actividad_puntos WHERE id = $1 RETURNING *', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Punto no encontrado.' });
  res.json({ mensaje: 'Punto eliminado.' });
}

module.exports = {
  listarActividades, obtenerActividad, crearActividad, actualizarActividad,
  marcarEstadoActividad, eliminarActividad, agregarPunto, marcarPunto, eliminarPunto
};
