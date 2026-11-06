const express = require('express');
const { createUser, getUsers, updateUser, deactivateUser, getAuditLogs } = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

// Todas las rutas de usuarios requieren autenticación y rol de Administrador
router.use(verifyToken);
router.use(requireRole(['Administrador']));

router.post('/', v.createUser, createUser);
router.get('/', getUsers);
router.get('/logs', v.listQuery, getAuditLogs);
router.put('/:id', v.updateUser, updateUser);
router.delete('/:id', v.onlyId, deactivateUser);

module.exports = router;
