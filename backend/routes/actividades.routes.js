const router = require('express').Router();
const ctrl = require('../controllers/actividades.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', ctrl.listarActividades);
router.get('/:id', ctrl.obtenerActividad);
router.post('/', requireRole('admin'), ctrl.crearActividad);
router.put('/:id', requireRole('admin'), ctrl.actualizarActividad);
router.put('/:id/estado', ctrl.marcarEstadoActividad); // admin o el técnico asignado
router.delete('/:id', requireRole('admin'), ctrl.eliminarActividad);

router.post('/:id/puntos', requireRole('admin'), ctrl.agregarPunto);
router.put('/puntos/:id', ctrl.marcarPunto); // admin o el técnico asignado
router.delete('/puntos/:id', requireRole('admin'), ctrl.eliminarPunto);

module.exports = router;
