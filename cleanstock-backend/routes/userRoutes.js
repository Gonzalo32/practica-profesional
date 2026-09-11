const express = require('express');
const { createUser, getUsers, updateUser, deactivateUser, getAuditLogs } = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// Todas las rutas de usuarios requieren autenticación y rol de Administrador
router.use(verifyToken);
router.use(requireRole(['Administrador']));

router.post('/', createUser);
router.get('/', getUsers);
router.get('/logs', getAuditLogs);
router.put('/:id', updateUser);
router.delete('/:id', deactivateUser);

module.exports = router;
