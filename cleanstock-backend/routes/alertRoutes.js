const express = require('express');
const { getStockAlerts, getExpirationAlerts, getAlertSummary, getKPIs, setBranchMinStock } = require('../controllers/alertController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

router.use(verifyToken);

// Alertas de stock bajo (Admin ve todo, otros roles ven solo su sucursal)
router.get('/', getStockAlerts);

// Lotes vencidos o por vencer (?days=30)
router.get('/expirations', getExpirationAlerts);

// Resumen para la campanita de notificaciones
router.get('/summary', getAlertSummary);

// KPIs del dashboard (solo Admin)
router.get('/kpis', requireRole(['Administrador']), getKPIs);

// Configurar stock mínimo por sucursal (Admin y Usuario Responsable)
router.put('/branch-min-stock', requireRole(['Administrador', 'Usuario Responsable']), v.branchMinStock, setBranchMinStock);

module.exports = router;
