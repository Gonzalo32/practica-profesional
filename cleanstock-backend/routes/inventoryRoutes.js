const express = require('express');
const {
  createCategory, getCategories,
  createProduct, getProducts, updateProduct,
  registerStockEntry, registerInformalEntry, registerExit, getLots
} = require('../controllers/inventoryController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

router.use(verifyToken); // Todas requieren autenticación

const STOCK_ROLES = ['Administrador', 'Usuario Responsable'];

// Categorías
router.get('/categories', getCategories);
router.post('/categories', requireRole(STOCK_ROLES), v.category, createCategory);

// Productos (?q= búsqueda, ?code= SKU o código de barras)
router.get('/products', getProducts);
router.post('/products', requireRole(STOCK_ROLES), v.createProduct, createProduct);
router.put('/products/:id', requireRole(STOCK_ROLES), v.updateProduct, updateProduct);

// Ingreso de Stock oficial (con lote y fecha de vencimiento)
router.post('/stock', requireRole(STOCK_ROLES), v.stockEntry, registerStockEntry);

// Módulo 2: Ingreso Extraordinario / Extraoficial
router.post('/informal-entry', requireRole(STOCK_ROLES), v.informalEntry, registerInformalEntry);

// Egresos y mermas (ventas, consumo, roturas, vencidos)
router.post('/exit', requireRole(STOCK_ROLES), v.stockExit, registerExit);

// Lotes con su vencimiento y saldo
router.get('/lots', requireRole(['Administrador', 'Usuario Responsable', 'Despachante']), getLots);

module.exports = router;
