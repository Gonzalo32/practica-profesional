const express = require('express');
const {
  getSuppliers, createSupplier, updateSupplier, deactivateSupplier,
  getPurchaseOrders, createPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder
} = require('../controllers/supplierController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

router.use(verifyToken);

const MANAGERS = ['Administrador', 'Usuario Responsable'];

// Órdenes de compra (el rol Proveedor solo ve las de su empresa)
router.get('/purchase-orders', requireRole([...MANAGERS, 'Proveedor']), getPurchaseOrders);
router.post('/purchase-orders', requireRole(MANAGERS), v.purchaseOrder, createPurchaseOrder);
router.post('/purchase-orders/:id/receive', requireRole(MANAGERS), v.receivePurchaseOrder, receivePurchaseOrder);
router.post('/purchase-orders/:id/cancel', requireRole(MANAGERS), v.onlyId, cancelPurchaseOrder);

// Proveedores
router.get('/', requireRole([...MANAGERS, 'Proveedor']), getSuppliers);
router.post('/', requireRole(MANAGERS), v.supplier, createSupplier);
router.put('/:id', requireRole(MANAGERS), v.supplierUpdate, updateSupplier);
router.delete('/:id', requireRole(['Administrador']), v.onlyId, deactivateSupplier);

module.exports = router;
