const router = require('express').Router();
const ctrl = require('../controllers/clientes.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const uploadExcel = require('../middleware/uploadExcel');

router.use(requireAuth);

router.get('/', ctrl.listarClientes);
router.get('/resumen-semaforo', ctrl.resumenSemaforo);
router.get('/plantilla', requireRole('admin'), ctrl.descargarPlantilla);          // debe ir ANTES de /:id
router.post('/importar', requireRole('admin'), uploadExcel.single('archivo'), ctrl.importarClientes);
router.get('/folio/:folio', ctrl.buscarPorFolio); // usado por técnicos para autocompletar
router.get('/:id', ctrl.obtenerCliente);
router.post('/', requireRole('admin'), ctrl.crearCliente);
router.put('/:id', requireRole('admin'), ctrl.actualizarCliente);
router.delete('/:id', requireRole('admin'), ctrl.eliminarCliente);

module.exports = router;
