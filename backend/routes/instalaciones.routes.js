const router = require('express').Router();
const ctrl = require('../controllers/instalaciones.controller');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(requireAuth);

router.get('/', ctrl.listarInstalaciones);
router.get('/cliente/:clienteId', ctrl.obtenerInstalacionesDeCliente);
router.post('/', upload.single('evidencia'), ctrl.registrarInstalacion);

module.exports = router;
