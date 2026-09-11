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

const router = express.Router();

router.use(verifyToken);

// Listar todas las sucursales (todos los roles autenticados pueden ver el listado)
router.get('/', getBranches);

// Crear sucursal (solo Admin)
router.post('/', requireRole(['Administrador']), createBranch);

// Actualizar sucursal (solo Admin)
router.put('/:id', requireRole(['Administrador']), updateBranch);

// Eliminar sucursal (solo Admin)
router.delete('/:id', requireRole(['Administrador']), deleteBranch);

// Stock de una sucursal (con control de visibilidad por rol — Módulo 3)
// 'my-branch' es resuelto por el middleware usando el branchId del token
router.get('/my-branch/stock', requireBranchAccess, getBranchStock);
router.get('/:id/stock', requireBranchAccess, getBranchStock);

// Ajustar stock manualmente (Responsable o Admin, solo su sucursal)
router.post('/:id/stock/adjust', requireRole(['Administrador', 'Usuario Responsable']), requireBranchAccess, adjustBranchStock);

// Trazabilidad de movimientos de stock (Admin, Responsable, Despachante)
router.get('/movements', requireRole(['Administrador', 'Usuario Responsable', 'Despachante']), getStockMovements);

module.exports = router;
