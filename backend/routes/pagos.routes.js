const router = require('express').Router();
const ctrl = require('../controllers/pagos.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);
// Administradores: todo. Cobranza: solo consultar el historial de un cliente y registrar pagos
// (nunca el listado general ni eliminar).

router.get('/', requireRole('admin'), ctrl.listarPagos);
router.get('/cliente/:clienteId/desglose', requireRole('admin', 'cobranza'), ctrl.desgloseCliente);
router.get('/cliente/:clienteId', requireRole('admin', 'cobranza'), ctrl.historialCliente);
router.post('/', requireRole('admin', 'cobranza'), ctrl.registrarPago);
router.delete('/:id', requireRole('admin'), ctrl.eliminarPago);

module.exports = router;
