const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');

router.post('/login', ctrl.login);
router.get('/perfil', requireAuth, ctrl.perfil);

module.exports = router;
