const express = require('express');
const { createOrder, getOrders, approveOrder, updateOrder, prepareOrder, updateOrderStatus, getOrderHistory } = require('../controllers/orderController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

router.use(verifyToken);

const ORDER_ROLES = ['Administrador', 'Solicitante', 'Despachante', 'Usuario Responsable'];
const CREATE_EDIT_ORDER_ROLES = ['Administrador', 'Solicitante', 'Usuario Responsable'];

// T4.2 Crear una Orden (Solicitante, Usuario Responsable o Admin)
router.post('/', requireRole(CREATE_EDIT_ORDER_ROLES), v.createOrder, createOrder);

// Obtener órdenes (Solicitantes ven las suyas, Despachantes/Admin/Responsables ven todas)
router.get('/', requireRole(ORDER_ROLES), v.listQuery, getOrders);

// T4.3 Aprobar un pedido que espera validación (Administrador o Responsable de la sucursal de origen;
// el controlador verifica la sucursal)
router.post('/:orderId/approve', requireRole(['Administrador', 'Usuario Responsable']), v.approveOrder, approveOrder);

// Preparar y despachar un pedido seleccionando cantidades por variante/lote (Admin o Despachante)
router.post('/:orderId/prepare', requireRole(['Administrador', 'Despachante']), v.prepareOrder, prepareOrder);

// Modificar los productos de un pedido que todavía no se empezó a preparar (quien lo pidió o el admin)
router.put('/:orderId', requireRole(CREATE_EDIT_ORDER_ROLES), v.updateOrder, updateOrder);

// T5.2 y T5.3 Actualizar estado de orden (incluye CANCELADO y RECHAZADO)
router.put('/:orderId/status', requireRole(ORDER_ROLES), v.orderStatus, updateOrderStatus);

// T5.4 Obtener historial de auditoría de orden
router.get('/:orderId/history', requireRole(ORDER_ROLES), getOrderHistory);

module.exports = router;
