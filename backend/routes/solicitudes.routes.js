const router = require('express').Router();
const ctrl = require('../controllers/solicitudes.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', ctrl.listarSolicitudes);
router.get('/:id', ctrl.obtenerSolicitud);
router.post('/', ctrl.crearSolicitud); // técnico o admin, captura en campo
router.put('/:id', requireRole('admin'), ctrl.actualizarSolicitud);
router.post('/:id/convertir', requireRole('admin'), ctrl.convertirACliente);
router.delete('/:id', requireRole('admin'), ctrl.eliminarSolicitud);

module.exports = router;
