const express = require('express');
const { getDashboard } = require('../controllers/reportController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken);

router.get('/dashboard', requireRole(['Administrador']), getDashboard);

module.exports = router;
