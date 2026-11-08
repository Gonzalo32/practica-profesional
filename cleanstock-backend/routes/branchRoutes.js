const express = require('express');
const {
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  getBranchStock,
  getAvailableProducts,
  adjustBranchStock,
  getStockMovements
} = require('../controllers/branchController');
const { verifyToken, requireRole, requireBranchAccess } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

router.use(verifyToken);

router.get('/', getBranches);

router.post('/', requireRole(['Administrador']), v.branch, createBranch);
router.put('/:id', requireRole(['Administrador']), v.branchUpdate, updateBranch);
router.delete('/:id', requireRole(['Administrador']), v.onlyId, deleteBranch);

router.get('/movements', requireRole(['Administrador', 'Usuario Responsable', 'Despachante']), v.listQuery, getStockMovements);

router.get('/:id/stock', requireBranchAccess, getBranchStock);

router.get('/:id/available', requireRole(['Administrador', 'Solicitante', 'Usuario Responsable', 'Despachante']), v.onlyId, getAvailableProducts);

router.post('/:id/stock/adjust', requireRole(['Administrador', 'Usuario Responsable']), requireBranchAccess, v.stockAdjust, adjustBranchStock);

module.exports = router;
