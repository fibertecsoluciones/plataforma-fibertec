const router = require('express').Router();
const ctrl = require('../controllers/finanzas.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const pagosTecnicos = require('../controllers/pagos-tecnicos.controller');

router.use(requireAuth);
router.use(requireRole('admin')); // toda la sección de finanzas es exclusiva de administradores

router.get('/resumen-mes', ctrl.resumenMesActual);
router.get('/resumen-mensual', ctrl.resumenMensual);
router.get('/egresos-por-categoria', ctrl.egresosPorCategoria);
router.get('/desglose-mes', ctrl.desgloseMes);
router.get('/ingresos-detalle', ctrl.ingresosDetalle);

router.get('/egresos', ctrl.listarEgresos);
router.post('/egresos', upload.single('comprobante'), ctrl.crearEgreso);
router.put('/egresos/:id', upload.single('comprobante'), ctrl.actualizarEgreso);
router.delete('/egresos/:id', ctrl.eliminarEgreso);

router.get('/ingresos-extra', ctrl.listarIngresosExtra);
router.post('/ingresos-extra', upload.single('comprobante'), ctrl.crearIngresoExtra);
router.put('/ingresos-extra/:id', upload.single('comprobante'), ctrl.actualizarIngresoExtra);
router.delete('/ingresos-extra/:id', ctrl.eliminarIngresoExtra);

// ---------- Pagos a técnicos (por actividades) ----------
// Las rutas fijas van ANTES de /:id
router.get('/pagos-tecnicos/tecnicos', pagosTecnicos.listarTecnicos);
router.get('/pagos-tecnicos/resumen', pagosTecnicos.resumen);
router.get('/pagos-tecnicos/por-agrupar', pagosTecnicos.actividadesPorAgrupar);
router.get('/pagos-tecnicos/fuera-de-pago', pagosTecnicos.actividadesFueraDePago);
router.post('/pagos-tecnicos/excluir', pagosTecnicos.excluirActividades);
router.post('/pagos-tecnicos/incluir', pagosTecnicos.incluirActividades);
router.post('/pagos-tecnicos/excluir-anteriores', pagosTecnicos.excluirAnteriores);
router.get('/pagos-tecnicos', pagosTecnicos.listarPagos);
router.post('/pagos-tecnicos', pagosTecnicos.crearPago);
router.get('/pagos-tecnicos/:id', pagosTecnicos.obtenerPago);
router.put('/pagos-tecnicos/:id', pagosTecnicos.actualizarPago);
router.delete('/pagos-tecnicos/:id', pagosTecnicos.cancelarPago);
router.post('/pagos-tecnicos/:id/abonos', pagosTecnicos.registrarAbono);   // pagar todo o una parte
router.post('/pagos-tecnicos/:id/pagar', pagosTecnicos.registrarAbono);    // (igual que /abonos; sin "monto" paga todo lo que falta)
router.delete('/pagos-tecnicos/:id/abonos/:abonoId', pagosTecnicos.deshacerAbono);

module.exports = router;
