const express = require('express');
const {
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  getBranchStock,
  adjustBranchStock,
  getStockMovements
} = require('../controllers/branchController');
const { verifyToken, requireRole, requireBranchAccess } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

router.use(verifyToken);

// Listar todas las sucursales (todos los roles autenticados pueden ver el listado)
router.get('/', getBranches);

// Crear, actualizar y eliminar sucursales (solo Admin)
router.post('/', requireRole(['Administrador']), v.branch, createBranch);
router.put('/:id', requireRole(['Administrador']), v.branchUpdate, updateBranch);
router.delete('/:id', requireRole(['Administrador']), v.onlyId, deleteBranch);

// Trazabilidad de movimientos de stock (Admin, Responsable, Despachante)
router.get('/movements', requireRole(['Administrador', 'Usuario Responsable', 'Despachante']), v.listQuery, getStockMovements);

// Stock de una sucursal (con control de visibilidad por rol — Módulo 3).
// "my-branch" lo resuelve el middleware con el branchId del token.
router.get('/my-branch/stock', requireBranchAccess, getBranchStock);
router.get('/:id/stock', requireBranchAccess, getBranchStock);

// Ajustar stock manualmente (Responsable o Admin, solo su sucursal)
router.post('/:id/stock/adjust', requireRole(['Administrador', 'Usuario Responsable']), requireBranchAccess, v.stockAdjust, adjustBranchStock);

module.exports = router;
