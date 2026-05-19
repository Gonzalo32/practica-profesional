const express = require('express');
const { 
  createCategory, getCategories, 
  createProduct, getProducts, 
  registerStockEntry 
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

// Ingreso de Stock
router.post('/stock', requireRole(['Administrador', 'Usuario Responsable']), registerStockEntry);

module.exports = router;
