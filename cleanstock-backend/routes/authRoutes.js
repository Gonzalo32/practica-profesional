const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, getMe } = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

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

module.exports = router;
