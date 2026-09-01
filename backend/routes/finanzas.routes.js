const router = require('express').Router();
const ctrl = require('../controllers/finanzas.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(requireAuth);

router.get('/resumen-mes', ctrl.resumenMesActual);
router.get('/resumen-mensual', ctrl.resumenMensual);
router.get('/egresos-por-categoria', ctrl.egresosPorCategoria);

router.get('/egresos', ctrl.listarEgresos);
router.post('/egresos', requireRole('admin'), upload.single('comprobante'), ctrl.crearEgreso);
router.delete('/egresos/:id', requireRole('admin'), ctrl.eliminarEgreso);

module.exports = router;
