const router = require('express').Router();
const ctrl = require('../controllers/catalogos.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/zonas', ctrl.getZonas);
router.post('/zonas', requireRole('admin'), ctrl.crearZona);

router.get('/planes', ctrl.getPlanes);
router.post('/planes', requireRole('admin'), ctrl.crearPlan);

router.get('/tecnicos', ctrl.getTecnicos);
router.post('/usuarios', requireRole('admin'), ctrl.crearUsuario);

router.get('/egresos-categorias', ctrl.getEgresosCategorias);
router.get('/inventario-categorias', ctrl.getInventarioCategorias);

module.exports = router;
