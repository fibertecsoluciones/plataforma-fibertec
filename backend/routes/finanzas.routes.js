const router = require('express').Router();
const ctrl = require('../controllers/finanzas.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(requireAuth);
router.use(requireRole('admin')); // toda la sección de finanzas es exclusiva de administradores

router.get('/resumen-mes', ctrl.resumenMesActual);
router.get('/resumen-mensual', ctrl.resumenMensual);
router.get('/egresos-por-categoria', ctrl.egresosPorCategoria);

router.get('/egresos', ctrl.listarEgresos);
router.post('/egresos', upload.single('comprobante'), ctrl.crearEgreso);
router.put('/egresos/:id', upload.single('comprobante'), ctrl.actualizarEgreso);
router.delete('/egresos/:id', ctrl.eliminarEgreso);

router.get('/ingresos-extra', ctrl.listarIngresosExtra);
router.post('/ingresos-extra', upload.single('comprobante'), ctrl.crearIngresoExtra);
router.put('/ingresos-extra/:id', upload.single('comprobante'), ctrl.actualizarIngresoExtra);
router.delete('/ingresos-extra/:id', ctrl.eliminarIngresoExtra);

module.exports = router;
