const router = require('express').Router();
const ctrl = require('../controllers/instalaciones.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(requireAuth);

router.get('/', ctrl.listarInstalaciones);
router.get('/cliente/:clienteId', ctrl.obtenerInstalacionesDeCliente);
router.post('/', upload.single('evidencia'), ctrl.registrarInstalacion);
router.put('/:id', requireRole('admin'), upload.single('evidencia'), ctrl.actualizarInstalacion);
router.delete('/:id', requireRole('admin'), ctrl.eliminarInstalacion);

module.exports = router;
