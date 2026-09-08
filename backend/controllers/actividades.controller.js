const db = require('../config/db');

// Lista actividades. Admin ve todas (con filtros opcionales); técnico solo ve las suyas.
async function listarActividades(req, res) {
  try {
    const { tecnicoId, estado, tipo } = req.query;
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

    if (tipo) {
      params.push(tipo);
      sql += ` AND a.tipo = $${params.length}`;
    }

    sql += ` GROUP BY a.id, u.nombre, cu.nombre, c.cliente_id, c.nombre, inst.fecha_instalacion
             ORDER BY a.orden ASC NULLS LAST, a.creado_en DESC`;

    const r = await db.query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error('Error en listarActividades:', err);
    res.status(500).json({ error: 'No se pudieron cargar las actividades.' });
  }
}

// Detalle de una actividad, con su checklist de puntos.
async function obtenerActividad(req, res) {
  try {
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
      `SELECT p.*, u.nombre AS completado_por_nombre
       FROM actividad_puntos p
       LEFT JOIN usuarios u ON u.id = p.completado_por
       WHERE p.actividad_id = $1 ORDER BY p.orden ASC, p.id ASC`,
      [id]
    );

    res.json({ ...actividad, puntos: puntosRes.rows });
  } catch (err) {
    console.error('Error en obtenerActividad:', err);
    res.status(500).json({ error: 'No se pudo cargar la actividad.' });
  }
}

// Crea una actividad (solo admin), con su checklist de puntos opcional.
async function crearActividad(req, res) {
  const { titulo, descripcion, tecnico_id, cliente_id, cliente_folio, prioridad, tipo, fecha_limite, puntos, latitud, longitud } = req.body;

  if (!titulo || !tecnico_id) {
    return res.status(400).json({ error: 'Título y técnico asignado son obligatorios.' });
  }

  let clienteIdResuelto = cliente_id || null;
  const client = await db.pool.connect();
  try {
    if (!clienteIdResuelto && cliente_folio && cliente_folio.trim()) {
      const clienteRes = await client.query('SELECT id FROM clientes WHERE UPPER(cliente_id) = UPPER($1)', [cliente_folio.trim()]);
      if (!clienteRes.rows[0]) {
        client.release();
        return res.status(400).json({ error: `No existe ningún cliente con el folio "${cliente_folio}".` });
      }
      clienteIdResuelto = clienteRes.rows[0].id;
    }

    await client.query('BEGIN');

    const ordenRes = await client.query('SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM actividades');

    const r = await client.query(
      `INSERT INTO actividades (titulo, descripcion, tecnico_id, cliente_id, prioridad, tipo, fecha_limite, creado_por, latitud, longitud, orden)
       VALUES ($1,$2,$3,$4,COALESCE($5,'media'),COALESCE($6,'instalacion'),$7,$8,$9,$10,$11)
       RETURNING *`,
      [titulo, descripcion, tecnico_id, clienteIdResuelto, prioridad, tipo, fecha_limite || null, req.usuario.id, latitud || null, longitud || null, ordenRes.rows[0].siguiente]
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
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error en crearActividad:', err);
    res.status(500).json({ error: 'No se pudo crear la actividad.' });
  } finally {
    client.release();
  }
}

// Edita los datos generales de una actividad (solo admin). No toca los puntos aquí.
async function actualizarActividad(req, res) {
  try {
    const { id } = req.params;
    const campos = ['titulo', 'descripcion', 'tecnico_id', 'cliente_id', 'prioridad', 'tipo', 'fecha_limite', 'latitud', 'longitud'];
    const sets = []; const params = [];

    // Si mandan cliente_folio (desde el buscador del formulario), lo resolvemos a
    // cliente_id igual que al crear una actividad nueva.
    if (req.body.cliente_folio !== undefined) {
      if (req.body.cliente_folio && req.body.cliente_folio.trim()) {
        const clienteRes = await db.query('SELECT id FROM clientes WHERE UPPER(cliente_id) = UPPER($1)', [req.body.cliente_folio.trim()]);
        if (!clienteRes.rows[0]) {
          return res.status(400).json({ error: `No existe ningún cliente con el folio "${req.body.cliente_folio}".` });
        }
        req.body.cliente_id = clienteRes.rows[0].id;
      } else {
        req.body.cliente_id = null; // se dejó vacío el campo de cliente a propósito
      }
    }

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
  } catch (err) {
    console.error('Error en actualizarActividad:', err);
    res.status(500).json({ error: 'No se pudo actualizar la actividad.' });
  }
}

// Marca una actividad SIN checklist como completada o pendiente (a mano).
// Cualquiera de los dos (admin o el técnico asignado) puede usarlo.
async function marcarEstadoActividad(req, res) {
  try {
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
      `UPDATE actividades SET estado = $1, completado_en = CASE WHEN $1::varchar = 'completada' THEN now() ELSE NULL END
       WHERE id = $2 RETURNING *`,
      [estado, id]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error en marcarEstadoActividad:', err);
    res.status(500).json({ error: 'No se pudo actualizar el estado de la actividad.' });
  }
}

// Guarda las notas del técnico sobre una actividad (cómo salió, observaciones, etc.).
// Lo puede hacer el técnico asignado o el admin — igual que marcar el estado.
async function guardarNotasTecnico(req, res) {
  try {
    const { id } = req.params;
    const { notas_tecnico } = req.body;

    const actividadRes = await db.query('SELECT * FROM actividades WHERE id = $1', [id]);
    const actividad = actividadRes.rows[0];
    if (!actividad) return res.status(404).json({ error: 'Actividad no encontrada.' });
    if (req.usuario.rol !== 'admin' && actividad.tecnico_id !== req.usuario.id) {
      return res.status(403).json({ error: 'No tienes permiso para modificar esta actividad.' });
    }

    const r = await db.query(
      'UPDATE actividades SET notas_tecnico = $1 WHERE id = $2 RETURNING *',
      [notas_tecnico, id]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error en guardarNotasTecnico:', err);
    res.status(500).json({ error: 'No se pudieron guardar las notas.' });
  }
}

// Guarda el nuevo orden después de arrastrar y soltar (solo admin). Recibe la lista
// completa de ids en el orden final deseado y les asigna 1, 2, 3... en ese orden.
async function reordenarActividades(req, res) {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'Se necesita la lista de ids en el nuevo orden.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < ids.length; i++) {
      await client.query('UPDATE actividades SET orden = $1 WHERE id = $2', [i + 1, ids[i]]);
    }
    await client.query('COMMIT');
    res.json({ mensaje: 'Orden actualizado.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error en reordenarActividades:', err);
    res.status(500).json({ error: 'No se pudo guardar el nuevo orden.' });
  } finally {
    client.release();
  }
}

async function eliminarActividad(req, res) {
  try {
    const { id } = req.params;
    const r = await db.query('DELETE FROM actividades WHERE id = $1 RETURNING *', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Actividad no encontrada.' });
    res.json({ mensaje: 'Actividad eliminada.' });
  } catch (err) {
    console.error('Error en eliminarActividad:', err);
    res.status(500).json({ error: 'No se pudo eliminar la actividad.' });
  }
}

// ---------- PUNTOS (checklist) ----------

// Agrega un punto nuevo a una actividad ya existente (solo admin).
async function agregarPunto(req, res) {
  try {
    const { id } = req.params; // id de la actividad
    const { descripcion } = req.body;
    if (!descripcion || !descripcion.trim()) return res.status(400).json({ error: 'La descripción del punto es obligatoria.' });

    const ordenRes = await db.query('SELECT COALESCE(MAX(orden), -1) + 1 AS siguiente FROM actividad_puntos WHERE actividad_id = $1', [id]);
    const r = await db.query(
      `INSERT INTO actividad_puntos (actividad_id, descripcion, orden) VALUES ($1,$2,$3) RETURNING *`,
      [id, descripcion.trim(), ordenRes.rows[0].siguiente]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('Error en agregarPunto:', err);
    res.status(500).json({ error: 'No se pudo agregar el punto.' });
  }
}

// Marca/desmarca un punto del checklist. Lo puede hacer el técnico asignado o el admin.
async function marcarPunto(req, res) {
  try {
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
       completado_por = CASE WHEN $1 THEN $2::integer ELSE NULL END
       WHERE id = $3 RETURNING *`,
      [!!completado, req.usuario.id, id]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error('Error en marcarPunto:', err);
    res.status(500).json({ error: 'No se pudo actualizar el punto. Intenta de nuevo.' });
  }
}

async function eliminarPunto(req, res) {
  try {
    const { id } = req.params;
    const r = await db.query('DELETE FROM actividad_puntos WHERE id = $1 RETURNING *', [id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Punto no encontrado.' });
    res.json({ mensaje: 'Punto eliminado.' });
  } catch (err) {
    console.error('Error en eliminarPunto:', err);
    res.status(500).json({ error: 'No se pudo eliminar el punto.' });
  }
}

module.exports = {
  listarActividades, obtenerActividad, crearActividad, actualizarActividad,
  marcarEstadoActividad, guardarNotasTecnico, eliminarActividad, agregarPunto, marcarPunto, eliminarPunto,
  reordenarActividades
};
