const express = require('express');
const { createSpace, getSpaces, updateSpace, deleteSpace } = require('../controllers/spaceController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

router.use(verifyToken);

router.get('/', requireRole(['Administrador']), getSpaces);
router.post('/', requireRole(['Administrador']), v.space, createSpace);
router.put('/:id', requireRole(['Administrador']), v.spaceUpdate, updateSpace);
router.delete('/:id', requireRole(['Administrador']), v.onlyId, deleteSpace);

module.exports = router;
