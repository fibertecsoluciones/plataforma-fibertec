const router = require('express').Router();
const ctrl = require('../controllers/catalogos.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/zonas', ctrl.getZonas);
router.post('/zonas', requireRole('admin'), ctrl.crearZona);
router.put('/zonas/:id', requireRole('admin'), ctrl.actualizarZona);
router.delete('/zonas/:id', requireRole('admin'), ctrl.eliminarZona);

router.get('/planes', ctrl.getPlanes);
router.post('/planes', requireRole('admin'), ctrl.crearPlan);
router.put('/planes/:id', requireRole('admin'), ctrl.actualizarPlan);
router.delete('/planes/:id', requireRole('admin'), ctrl.eliminarPlan);

router.get('/tecnicos', ctrl.getTecnicos);
router.post('/usuarios', requireRole('admin'), ctrl.crearUsuario);
router.put('/usuarios/:id', requireRole('admin'), ctrl.actualizarUsuario);
router.delete('/usuarios/:id', requireRole('admin'), ctrl.eliminarUsuario);

router.get('/egresos-categorias', ctrl.getEgresosCategorias);
router.get('/inventario-categorias', ctrl.getInventarioCategorias);

module.exports = router;
