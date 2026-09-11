const express = require('express');
const { getStockAlerts, getKPIs, setBranchMinStock } = require('../controllers/alertController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken);

// Alertas de stock bajo (Admin ve todo, otros roles ven solo su sucursal)
router.get('/', getStockAlerts);

// KPIs del dashboard (solo Admin)
router.get('/kpis', requireRole(['Administrador']), getKPIs);

// Configurar stock mínimo por sucursal (Admin y Usuario Responsable)
router.put('/branch-min-stock', requireRole(['Administrador', 'Usuario Responsable']), setBranchMinStock);

module.exports = router;
