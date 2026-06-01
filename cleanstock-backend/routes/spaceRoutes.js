const express = require('express');
const { createSpace, getSpaces, updateSpace, deleteSpace } = require('../controllers/spaceController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken);

// Rutas de Espacios Físicos (restringidas a Administrador)
router.get('/', requireRole(['Administrador']), getSpaces);
router.post('/', requireRole(['Administrador']), createSpace);
router.put('/:id', requireRole(['Administrador']), updateSpace);
router.delete('/:id', requireRole(['Administrador']), deleteSpace);

module.exports = router;
