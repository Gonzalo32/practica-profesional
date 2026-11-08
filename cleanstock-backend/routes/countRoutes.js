const express = require('express');
const { getCounts, getCount, createCount, updateCountItems, closeCount, cancelCount } = require('../controllers/countController');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');
const v = require('../validators');

const router = express.Router();

router.use(verifyToken);
router.use(requireRole(['Administrador', 'Usuario Responsable']));

router.get('/', getCounts);
router.post('/', v.createCount, createCount);
router.get('/:id', v.onlyId, getCount);
router.put('/:id', v.updateCount, updateCountItems);
router.post('/:id/close', v.onlyId, closeCount);
router.post('/:id/cancel', v.onlyId, cancelCount);

module.exports = router;
