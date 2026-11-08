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

// Listar todas las sucursales (todos los roles autenticados pueden ver el listado)
router.get('/', getBranches);

// Crear, actualizar y eliminar sucursales (solo Admin)
router.post('/', requireRole(['Administrador']), v.branch, createBranch);
router.put('/:id', requireRole(['Administrador']), v.branchUpdate, updateBranch);
router.delete('/:id', requireRole(['Administrador']), v.onlyId, deleteBranch);

// Trazabilidad de movimientos de stock (Admin, Responsable, Despachante)
router.get('/movements', requireRole(['Administrador', 'Usuario Responsable', 'Despachante']), v.listQuery, getStockMovements);

// Stock de una sucursal (con control de visibilidad por rol — Módulo 3).
// /my-branch/stock también entra acá (id = "my-branch") y el middleware lo
// reemplaza por la sucursal del usuario.
router.get('/:id/stock', requireBranchAccess, getBranchStock);

// Productos con stock disponible en una sucursal (para armar pedidos: no se ofrece lo que no hay)
router.get('/:id/available', requireRole(['Administrador', 'Solicitante', 'Usuario Responsable', 'Despachante']), v.onlyId, getAvailableProducts);

// Ajustar stock manualmente (Responsable o Admin, solo su sucursal)
router.post('/:id/stock/adjust', requireRole(['Administrador', 'Usuario Responsable']), requireBranchAccess, v.stockAdjust, adjustBranchStock);

module.exports = router;
