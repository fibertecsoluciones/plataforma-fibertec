const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Rol "cobranza": solo puede consultar clientes y registrar/consultar pagos.
// Esta lista es una segunda barrera (además del requireRole de cada ruta): aunque se agregue una
// ruta nueva y se olvide protegerla, un usuario de cobranza solo llega a estas.
const PERMITIDO_COBRANZA = [
  ['GET',  /^\/api\/auth\/perfil\/?$/],
  ['GET',  /^\/api\/clientes\/?$/],
  ['GET',  /^\/api\/clientes\/\d+\/?$/],
  ['GET',  /^\/api\/pagos\/cliente\/\d+(\/desglose)?\/?$/],
  ['POST', /^\/api\/pagos\/?$/]
];

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No autorizado. Falta el token de sesión.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET); // { id, usuario, nombre, rol }
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Inicia sesión de nuevo.' });
  }

  if (payload.rol === 'cobranza') {
    // Para cobranza se consulta la base en cada petición: si lo desactivas o le cambias la zona,
    // el cambio aplica al instante (no hay que esperar a que expire su sesión).
    try {
      const r = await db.query('SELECT rol, activo, zona_id, ocultar_montos FROM usuarios WHERE id = $1', [payload.id]);
      const u = r.rows[0];
      if (!u || !u.activo || u.rol !== 'cobranza') {
        return res.status(401).json({ error: 'Sesión inválida o expirada. Inicia sesión de nuevo.' });
      }
      payload = { ...payload, zona_id: u.zona_id, ocultar_montos: u.ocultar_montos === true };
    } catch (err) {
      console.error('Error verificando usuario de cobranza:', err);
      return res.status(500).json({ error: 'No se pudo verificar la sesión.' });
    }
    const ruta = req.originalUrl.split('?')[0];
    const ok = PERMITIDO_COBRANZA.some(([metodo, patron]) => metodo === req.method && patron.test(ruta));
    if (!ok) return res.status(403).json({ error: 'No tienes permisos para esta acción.' });
  }

  req.usuario = payload;
  next();
}

// Restringe la ruta a ciertos roles, ej: requireRole('admin')
function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
