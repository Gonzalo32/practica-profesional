const { InventoryCount, BranchStock, Product, PhysicalSpace, ActivityLog } = require('../models');
const { canAccessBranch } = require('../middlewares/authMiddleware');
const { effectiveBranchId } = require('../services/settingsService');
const stock = require('../services/stockService');
const { toId } = require('../utils/format');

const formatCount = (c, includeItems = true) => ({
  id: c._id.toString(),
  branchId: toId(c.branchId),
  branchName: c.branchId?.name || null,
  status: c.status,
  notes: c.notes,
  createdAt: c.createdAt,
  closedAt: c.closedAt,
  createdBy: c.createdBy && typeof c.createdBy === 'object'
    ? { firstName: c.createdBy.firstName, lastName: c.createdBy.lastName, username: c.createdBy.username }
    : null,
  totalItems: c.items.length,
  countedItems: c.items.filter(i => i.countedQty !== null && i.countedQty !== undefined).length,
  differences: c.items.filter(i => i.countedQty !== null && i.countedQty !== undefined && i.countedQty !== i.systemQty).length,
  items: includeItems ? c.items.map(i => ({
    productId: toId(i.productId),
    productName: i.productId?.name || null,
    sku: i.productId?.sku || null,
    systemQty: i.systemQty,
    countedQty: i.countedQty,
    appliedDifference: i.appliedDifference
  })) : undefined
});

const loadCount = (id) => InventoryCount.findById(id)
  .populate('branchId', 'name')
  .populate('items.productId', 'name sku')
  .populate('createdBy', 'firstName lastName username');

const getCounts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.branchId) filter.branchId = req.query.branchId;
    if (req.user.role !== 'Administrador') {
      const ownBranch = await effectiveBranchId(req.user);
      if (!ownBranch) return res.json([]);
      filter.branchId = ownBranch;
    }
    const counts = await InventoryCount.find(filter)
      .populate('branchId', 'name')
      .populate('createdBy', 'firstName lastName username')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(counts.map(c => formatCount(c, false)));
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo conteos', error: error.message });
  }
};

const getCount = async (req, res) => {
  try {
    const count = await loadCount(req.params.id).lean();
    if (!count) return res.status(404).json({ message: 'Conteo no encontrado' });
    if (!(await canAccessBranch(req.user, toId(count.branchId)))) {
      return res.status(403).json({ message: 'No tenés acceso a esta sucursal' });
    }
    res.json(formatCount(count));
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo el conteo', error: error.message });
  }
};

const createCount = async (req, res) => {
  try {
    const { branchId, notes } = req.body;
    if (!(await canAccessBranch(req.user, branchId))) {
      return res.status(403).json({ message: 'Solo podés contar el stock de tu sucursal' });
    }
    const branch = await PhysicalSpace.findById(branchId);
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });

    const open = await InventoryCount.exists({ branchId, status: 'ABIERTO' });
    if (open) return res.status(400).json({ message: 'Ya hay un conteo abierto para esta sucursal. Cerralo o cancelalo primero.' });

    const [products, stockItems] = await Promise.all([
      Product.find().sort({ name: 1 }).lean(),
      BranchStock.find({ branchId }).lean()
    ]);
    const qtyByProduct = new Map(stockItems.map(s => [s.productId.toString(), s.quantity]));

    const count = await InventoryCount.create({
      branchId,
      notes: notes || null,
      createdBy: req.user.id,
      items: products.map(p => ({
        productId: p._id,
        systemQty: qtyByProduct.get(p._id.toString()) || 0,
        countedQty: null
      }))
    });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'OPEN_INVENTORY_COUNT',
      details: `Abrió un conteo de inventario en la sucursal "${branch.name}"`
    });

    res.status(201).json(formatCount(await loadCount(count._id).lean()));
  } catch (error) {
    res.status(500).json({ message: 'Error creando el conteo', error: error.message });
  }
};

const updateCountItems = async (req, res) => {
  try {
    const count = await InventoryCount.findById(req.params.id);
    if (!count) return res.status(404).json({ message: 'Conteo no encontrado' });
    if (!(await canAccessBranch(req.user, count.branchId))) return res.status(403).json({ message: 'No tenés acceso a esta sucursal' });
    if (count.status !== 'ABIERTO') return res.status(400).json({ message: 'El conteo ya está cerrado' });

    for (const entry of req.body.items) {
      const item = count.items.find(i => String(i.productId) === String(entry.productId));
      if (!item) continue;
      item.countedQty = entry.countedQty === null || entry.countedQty === '' ? null : parseInt(entry.countedQty, 10);
    }
    await count.save();

    res.json(formatCount(await loadCount(count._id).lean()));
  } catch (error) {
    res.status(500).json({ message: 'Error guardando el conteo', error: error.message });
  }
};

const closeCount = async (req, res) => {
  try {
    const pending = await InventoryCount.findById(req.params.id);
    if (!pending) return res.status(404).json({ message: 'Conteo no encontrado' });
    if (!(await canAccessBranch(req.user, pending.branchId))) return res.status(403).json({ message: 'No tenés acceso a esta sucursal' });

    const count = await InventoryCount.findOneAndUpdate(
      { _id: req.params.id, status: 'ABIERTO' },
      { $set: { status: 'CERRADO', closedBy: req.user.id, closedAt: new Date() } },
      { returnDocument: 'after' }
    ).populate('branchId', 'name').populate('items.productId', 'name');
    if (!count) return res.status(400).json({ message: 'El conteo ya está cerrado' });

    let adjusted = 0;
    for (const item of count.items) {
      if (item.countedQty === null || item.countedQty === undefined) continue;
      const previous = await stock.setStockQuantity(count.branchId._id, item.productId._id, item.countedQty);
      const difference = item.countedQty - previous;
      item.appliedDifference = difference;
      if (difference === 0) continue;
      adjusted++;

      let lots = [];
      if (difference < 0) lots = await stock.consumeLots(count.branchId._id, item.productId._id, -difference);

      await stock.recordMovement({
        type: 'CONTEO',
        branchId: count.branchId._id,
        productId: item.productId._id,
        quantity: difference,
        lotNumber: lots.map(l => l.lotNumber).join(', ') || null,
        countId: count._id,
        reason: `Conteo físico: sistema ${previous}, contado ${item.countedQty}`,
        userId: req.user.id
      });
    }
    await count.save();

    await ActivityLog.create({
      userId: req.user.id,
      action: 'CLOSE_INVENTORY_COUNT',
      details: `Cerró el conteo de inventario de "${count.branchId.name}" con ${adjusted} diferencia(s) ajustada(s)`
    });

    res.json({ message: `Conteo cerrado. Se ajustaron ${adjusted} producto(s).`, adjusted });
  } catch (error) {
    res.status(500).json({ message: 'Error cerrando el conteo', error: error.message });
  }
};

const cancelCount = async (req, res) => {
  try {
    const pending = await InventoryCount.findById(req.params.id);
    if (!pending) return res.status(404).json({ message: 'Conteo no encontrado' });
    if (!(await canAccessBranch(req.user, pending.branchId))) return res.status(403).json({ message: 'No tenés acceso a esta sucursal' });

    const count = await InventoryCount.findOneAndUpdate(
      { _id: req.params.id, status: 'ABIERTO' },
      { $set: { status: 'CANCELADO', closedBy: req.user.id, closedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!count) return res.status(400).json({ message: 'Solo se pueden cancelar conteos abiertos' });
    res.json({ message: 'Conteo cancelado' });
  } catch (error) {
    res.status(500).json({ message: 'Error cancelando el conteo', error: error.message });
  }
};

module.exports = {
  getCounts,
  getCount,
  createCount,
  updateCountItems,
  closeCount,
  cancelCount
};
