const express = require('express');
const { createOrder, getOrders, approveOrder } = require('../controllers/orderController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken);

// T4.2 Crear una Orden (Cualquier rol autorizado para pedir, ej. Solicitante o Admin)
router.post('/', requireRole(['Administrador', 'Solicitante']), createOrder);

// Obtener órdenes (Solicitantes ven las suyas, Despachantes/Admin ven todas)
router.get('/', requireRole(['Administrador', 'Solicitante', 'Despachante']), getOrders);

// T4.3 Aprobar orden mediante token (la puede usar un Admin o el sistema al recibir el token)
router.post('/:orderId/approve', requireRole(['Administrador']), approveOrder);

module.exports = router;
