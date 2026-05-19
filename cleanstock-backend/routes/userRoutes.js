const express = require('express');
const { createUser, getUsers, updateUser, deactivateUser } = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// Todas las rutas de usuarios requieren autenticación y rol de Administrador
router.use(verifyToken);
router.use(requireRole(['Administrador']));

router.post('/', createUser);
router.get('/', getUsers);
router.put('/:id', updateUser);
router.delete('/:id', deactivateUser);

module.exports = router;
