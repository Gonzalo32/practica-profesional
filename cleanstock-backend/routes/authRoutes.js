const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, generateValidationToken, getMe } = require('../controllers/authController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

// Máximo de intentos fallidos de login por IP en 15 minutos (frena ataques de fuerza bruta)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: parseInt(process.env.LOGIN_RATE_LIMIT, 10) || 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Demasiados intentos de inicio de sesión. Esperá 15 minutos y volvé a intentar.' }
});

router.post('/login', loginLimiter, v.login, login);
router.get('/me', verifyToken, getMe);

// Generar token de validación para aprobar pedidos (solo Admin)
router.post('/generate-validation', verifyToken, requireRole(['Administrador']), v.validationToken, generateValidationToken);

module.exports = router;
