const express = require('express');
const {
  createCategory, getCategories,
  createProduct, getProducts, updateProduct,
  registerStockEntry, registerInformalEntry
} = require('../controllers/inventoryController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken); // Todas requieren autenticación

// Categorías
router.get('/categories', getCategories);
router.post('/categories', requireRole(['Administrador', 'Usuario Responsable']), createCategory);

// Productos
router.get('/products', getProducts);
router.post('/products', requireRole(['Administrador', 'Usuario Responsable']), createProduct);
router.put('/products/:id', requireRole(['Administrador', 'Usuario Responsable']), updateProduct);

// Ingreso de Stock oficial (con lote y fecha de vencimiento)
router.post('/stock', requireRole(['Administrador', 'Usuario Responsable']), registerStockEntry);

// Módulo 2: Ingreso Extraordinario / Extraoficial
router.post('/informal-entry', requireRole(['Administrador', 'Usuario Responsable']), registerInformalEntry);

module.exports = router;


