const router = require('express').Router();
const ctrl = require('../controllers/inventario.controller');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/items', ctrl.listarItems);
router.post('/items', ctrl.crearItem);
router.put('/items/:id', ctrl.actualizarItem);

router.get('/movimientos', ctrl.listarMovimientos);
router.post('/movimientos', ctrl.registrarMovimiento);

module.exports = router;
