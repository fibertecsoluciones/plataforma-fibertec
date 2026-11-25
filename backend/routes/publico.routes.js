const router = require('express').Router();
const ctrl = require('../controllers/publico.controller');

// Sin autenticación: lo usan los formularios de la página pública
router.post('/solicitud', ctrl.crearSolicitudWeb);

module.exports = router;
