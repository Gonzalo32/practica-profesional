const express = require('express');
const { getBusinessSettings, updateBusinessSettings } = require('../controllers/settingsController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

router.use(verifyToken);

// Configuración del negocio (nombre y modo de trabajo)
router.get('/', getBusinessSettings);
router.put('/', requireRole(['Administrador']), v.settings, updateBusinessSettings);

module.exports = router;
