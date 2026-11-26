const db = require('../config/db');

// ============================================================
// Formularios de la página web pública (sin inicio de sesión).
// Cada envío se guarda como una solicitud (origen 'web') para que
// aparezca en Solicitudes y se pueda convertir en cliente.
// ============================================================

// Límite por IP: 5 envíos cada 15 minutos (en memoria; suficiente para frenar spam básico)
const VENTANA_MS = 15 * 60 * 1000;
const MAX_ENVIOS = 5;
const envios = new Map();
setInterval(() => {
  const ahora = Date.now();
  for (const [ip, marcas] of envios) {
    const vigentes = marcas.filter(t => ahora - t < VENTANA_MS);
    if (vigentes.length) envios.set(ip, vigentes); else envios.delete(ip);
  }
}, 5 * 60 * 1000).unref();

function limiteAlcanzado(ip) {
  const ahora = Date.now();
  return (envios.get(ip) || []).filter(t => ahora - t < VENTANA_MS).length >= MAX_ENVIOS;
}
// Solo cuentan los envíos válidos: equivocarse al llenar el formulario no gasta el límite
function registrarEnvio(ip) {
  const ahora = Date.now();
  const marcas = (envios.get(ip) || []).filter(t => ahora - t < VENTANA_MS);
  marcas.push(ahora); envios.set(ip, marcas);
}

const PLANES = { navega: 'NAVEGA', vuelo: 'VUELO', elite: 'ELITE', paquete_navega: 'NAVEGA', paquete_vuelo: 'VUELO' };
const ETIQUETA_PLAN = {
  navega: 'Plan Navega', vuelo: 'Plan Vuelo', elite: 'Plan Elite',
  paquete_navega: 'Paquete Navega + 1 cámara ($570)', paquete_vuelo: 'Paquete Vuelo + 2 cámaras ($830)',
  info: 'Solo información', cobertura: 'Preguntar por cobertura', soporte: 'Soporte técnico / reportar falla'
};
const limpiar = (v, max) => String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

async function guardarSolicitudWeb(req, res) {
  const b = req.body || {};

  // Anti-spam silencioso: campo trampa lleno o formulario enviado demasiado rápido → se responde "ok" sin guardar
  const tiempo = Number(b.tiempo);
  if (limpiar(b.sitio_web, 50) || !Number.isFinite(tiempo) || tiempo < 2000) {
    return res.status(201).json({ ok: true });
  }

  if (limiteAlcanzado(req.ip)) {
    return res.status(429).json({ error: 'Has enviado varios mensajes seguidos. Intenta de nuevo en unos minutos o escríbenos por WhatsApp.' });
  }

  const tipo = b.tipo === 'cobertura' ? 'cobertura' : 'contacto';
  const nombre = limpiar(b.nombre, 150);
  const telefono = limpiar(b.telefono, 30).replace(/[^\d+\s()-]/g, '');
  const digitos = telefono.replace(/\D/g, '');
  const colonia = limpiar(b.colonia, 120);
  const email = limpiar(b.email, 150);
  const mensaje = limpiar(b.mensaje, 1000);
  const plan = Object.prototype.hasOwnProperty.call(ETIQUETA_PLAN, b.plan) ? b.plan : null;

  if (nombre.length < 2) return res.status(400).json({ error: 'Escribe tu nombre completo.' });
  if (digitos.length < 10 || digitos.length > 13) return res.status(400).json({ error: 'Escribe un teléfono válido de 10 dígitos.' });
  if (!colonia) return res.status(400).json({ error: 'Escribe la colonia donde vives.' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'El correo no parece válido.' });

  registrarEnvio(req.ip);

  // Evita duplicados por doble clic: mismo teléfono y nombre en los últimos 10 minutos
  const dup = await db.query(
    `SELECT id FROM solicitudes_instalacion
     WHERE origen = 'web' AND lower(nombre) = lower($1) AND telefono = $2 AND creado_en > now() - interval '10 minutes' LIMIT 1`,
    [nombre, telefono]
  );
  if (dup.rows[0]) return res.status(201).json({ ok: true });

  // Plan y zona si coinciden con los del sistema (si no, quedan vacíos y se completan al convertir)
  let planId = null;
  if (plan && PLANES[plan]) {
    // Por palabra: en el sistema un plan puede llamarse, p. ej., "VUELO ELITE"
    const r = await db.query('SELECT id FROM planes WHERE activo = TRUE AND upper(nombre) LIKE $1 ORDER BY id LIMIT 1', ['%' + PLANES[plan] + '%']);
    planId = r.rows[0] ? r.rows[0].id : null;
  }
  let zonaId = null;
  const z = await db.query('SELECT id FROM zonas WHERE activo = TRUE AND upper(trim(nombre)) = upper($1) LIMIT 1', [colonia]);
  zonaId = z.rows[0] ? z.rows[0].id : null;

  const lineas = [`🌐 Página web — ${tipo === 'cobertura' ? 'Aviso de cobertura' : 'Formulario de contacto'}`];
  if (plan) lineas.push(`Interés: ${ETIQUETA_PLAN[plan]}`);
  if (mensaje) lineas.push(`Mensaje: ${mensaje}`);

  await db.query(
    `INSERT INTO solicitudes_instalacion (nombre, telefono, direccion, zona_id, plan_interes_id, notas, origen, email)
     VALUES ($1,$2,$3,$4,$5,$6,'web',$7)`,
    [nombre, telefono, `Colonia: ${colonia}`, zonaId, planId, lineas.join('\n'), email || null]
  );
  res.status(201).json({ ok: true });
}

async function crearSolicitudWeb(req, res) {
  try {
    await guardarSolicitudWeb(req, res);
  } catch (err) {
    console.error('Error guardando solicitud web:', err);
    if (!res.headersSent) {
      const sinMigracion = err && (err.code === '42703' || err.code === '42P01');
      res.status(500).json({ error: sinMigracion
        ? 'No pudimos guardar tu mensaje por un ajuste pendiente en el sistema. Escríbenos por WhatsApp.'
        : 'No pudimos guardar tu mensaje. Intenta de nuevo o escríbenos por WhatsApp.' });
      if (sinMigracion) console.error('→ Falta correr la migración 027: node db/migrate.js migrations/027_solicitudes_web.sql');
    }
  }
}

// Aviso de fallas generales que se muestra en la página. Nunca debe romper el sitio.
async function obtenerAviso(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    const r = await db.query('SELECT mensaje, tipo FROM aviso_sitio WHERE id = 1 AND activo = TRUE');
    res.json({ aviso: r.rows[0] && r.rows[0].mensaje ? r.rows[0] : null });
  } catch (err) {
    res.json({ aviso: null });
  }
}

module.exports = { crearSolicitudWeb, obtenerAviso };
