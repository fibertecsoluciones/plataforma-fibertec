const router = require('express').Router();
const ctrl = require('../controllers/pagos.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', ctrl.listarPagos);
router.get('/cliente/:clienteId/desglose', ctrl.desgloseCliente);
router.get('/cliente/:clienteId', ctrl.historialCliente);
router.post('/', requireRole('admin'), ctrl.registrarPago);
router.delete('/:id', requireRole('admin'), ctrl.eliminarPago);

module.exports = router;
