const express = require('express');
const { createOrder, getOrders, approveOrder, updateOrderStatus, getOrderHistory } = require('../controllers/orderController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

router.use(verifyToken);

const ORDER_ROLES = ['Administrador', 'Solicitante', 'Despachante', 'Usuario Responsable'];

// T4.2 Crear una Orden (Solicitante o Admin)
router.post('/', requireRole(['Administrador', 'Solicitante']), v.createOrder, createOrder);

// Obtener órdenes (Solicitantes ven las suyas, Despachantes/Admin/Responsables ven todas)
router.get('/', requireRole(ORDER_ROLES), v.listQuery, getOrders);

// T4.3 Aprobar orden mediante token
router.post('/:orderId/approve', requireRole(['Administrador']), v.approveOrder, approveOrder);

// T5.2 y T5.3 Actualizar estado de orden
router.put('/:orderId/status', requireRole(ORDER_ROLES), v.orderStatus, updateOrderStatus);

// T5.4 Obtener historial de auditoría de orden
router.get('/:orderId/history', requireRole(ORDER_ROLES), getOrderHistory);

module.exports = router;
