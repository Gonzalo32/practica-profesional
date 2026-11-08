const express = require('express');
const {
  createCategory, getCategories, updateCategory, deleteCategory,
  createProduct, getProducts, updateProduct,
  registerStockEntry, registerInformalEntry, registerExit, getLots
} = require('../controllers/inventoryController');
const { getBrands, createBrand, updateBrand, deleteBrand } = require('../controllers/brandController');
const { getProvisions, createProvision, approveProvision, updateProvision } = require('../controllers/provisionController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

router.use(verifyToken);

const STOCK_ROLES = ['Administrador', 'Usuario Responsable'];

router.get('/categories', getCategories);
router.post('/categories', requireRole(STOCK_ROLES), v.category, createCategory);
router.put('/categories/:id', requireRole(STOCK_ROLES), v.categoryUpdate, updateCategory);
router.delete('/categories/:id', requireRole(STOCK_ROLES), v.onlyId, deleteCategory);

router.get('/brands', getBrands);
router.post('/brands', requireRole(STOCK_ROLES), v.brand, createBrand);
router.put('/brands/:id', requireRole(STOCK_ROLES), v.brandUpdate, updateBrand);
router.delete('/brands/:id', requireRole(STOCK_ROLES), v.onlyId, deleteBrand);

router.get('/products', getProducts);
router.post('/products', requireRole(STOCK_ROLES), v.createProduct, createProduct);
router.put('/products/:id', requireRole(STOCK_ROLES), v.updateProduct, updateProduct);

router.post('/stock', requireRole(STOCK_ROLES), v.stockEntry, registerStockEntry);

router.get('/provisions', requireRole([...STOCK_ROLES, 'Proveedor']), v.listQuery, getProvisions);
router.post('/provisions', requireRole(STOCK_ROLES), v.provisionCreate, createProvision);
router.put('/provisions/:id', requireRole(STOCK_ROLES), v.provisionUpdate, updateProvision);
router.post('/provisions/:id/approve', requireRole(STOCK_ROLES), v.onlyId, approveProvision);

router.post('/informal-entry', requireRole(STOCK_ROLES), v.informalEntry, registerInformalEntry);

router.post('/exit', requireRole(STOCK_ROLES), v.stockExit, registerExit);

router.get('/lots', requireRole(['Administrador', 'Usuario Responsable', 'Despachante', 'Solicitante']), getLots);

module.exports = router;
