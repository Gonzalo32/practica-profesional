const express = require('express');
const { login, registerInitialAdmin, generateValidationToken } = require('../controllers/authController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/login', login);
router.post('/init', registerInitialAdmin);

// Ruta protegida de ejemplo para generar token de validación (solo Admin)
router.post('/generate-validation', verifyToken, requireRole(['Administrador']), generateValidationToken);

module.exports = router;
