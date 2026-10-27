const express = require('express');
const { getValuation, getDashboard } = require('../controllers/reportController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken);

router.get('/dashboard', requireRole(['Administrador']), getDashboard);
router.get('/valuation', requireRole(['Administrador', 'Usuario Responsable']), getValuation);

module.exports = router;
