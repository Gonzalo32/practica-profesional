const express = require('express');
const { getStockAlerts, getExpirationAlerts, getAlertSummary, getKPIs, setBranchMinStock } = require('../controllers/alertController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

router.use(verifyToken);

router.get('/', getStockAlerts);

router.get('/expirations', getExpirationAlerts);

router.get('/summary', getAlertSummary);

router.get('/kpis', requireRole(['Administrador']), getKPIs);

router.put('/branch-min-stock', requireRole(['Administrador', 'Usuario Responsable']), v.branchMinStock, setBranchMinStock);

module.exports = router;
