const express = require('express');
const { createOrder, getOrders, approveOrder, updateOrder, prepareOrder, updateOrderStatus, getOrderHistory } = require('../controllers/orderController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

router.use(verifyToken);

const ORDER_ROLES = ['Administrador', 'Solicitante', 'Despachante', 'Usuario Responsable'];
const CREATE_EDIT_ORDER_ROLES = ['Administrador', 'Solicitante', 'Usuario Responsable'];

router.post('/', requireRole(CREATE_EDIT_ORDER_ROLES), v.createOrder, createOrder);

router.get('/', requireRole(ORDER_ROLES), v.listQuery, getOrders);

router.post('/:orderId/approve', requireRole(['Administrador', 'Usuario Responsable']), v.approveOrder, approveOrder);

router.post('/:orderId/prepare', requireRole(['Administrador', 'Despachante']), v.prepareOrder, prepareOrder);

router.put('/:orderId', requireRole(CREATE_EDIT_ORDER_ROLES), v.updateOrder, updateOrder);

router.put('/:orderId/status', requireRole(ORDER_ROLES), v.orderStatus, updateOrderStatus);

router.get('/:orderId/history', requireRole(ORDER_ROLES), getOrderHistory);

module.exports = router;
