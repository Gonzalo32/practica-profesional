const express = require('express');
const { createOrder, getOrders, approveOrder, updateOrderStatus, getOrderHistory } = require('../controllers/orderController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken);

// T4.2 Crear una Orden (Cualquier rol autorizado para pedir, ej. Solicitante o Admin)
router.post('/', requireRole(['Administrador', 'Solicitante']), createOrder);

// Obtener órdenes (Solicitantes ven las suyas, Despachantes/Admin/Responsables ven todas)
router.get('/', requireRole(['Administrador', 'Solicitante', 'Despachante', 'Usuario Responsable']), getOrders);

// T4.3 Aprobar orden mediante token
router.post('/:orderId/approve', requireRole(['Administrador']), approveOrder);

// T5.2 y T5.3 Actualizar estado de orden
router.put('/:orderId/status', requireRole(['Administrador', 'Solicitante', 'Despachante', 'Usuario Responsable']), updateOrderStatus);

// T5.4 Obtener historial de auditoría de orden
router.get('/:orderId/history', requireRole(['Administrador', 'Solicitante', 'Despachante', 'Usuario Responsable']), getOrderHistory);

module.exports = router;
