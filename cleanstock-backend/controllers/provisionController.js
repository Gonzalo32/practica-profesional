const { Provision, StockMovement, StockEntry, Product, Supplier, BranchStock, PhysicalSpace, ActivityLog, User, Brand } = require('../models');
const { canAccessBranch } = require('../middlewares/authMiddleware');
const { effectiveBranchId } = require('../services/settingsService');
const stock = require('../services/stockService');
const { toId, parsePagination, todayAsUTCDate } = require('../utils/format');

// Provisiones: entregas de los proveedores (como un remito), con uno o varios productos.
// Se cargan PENDIENTES (no tocan el stock ni figuran como movimiento) y recién al
// aprobarlas el Responsable o el Administrador entran todos sus productos al stock.

const dateOnly = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
const userName = (u) => (u && typeof u === 'object'
  ? ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.username)
  : null);

const format = (p) => ({
  id: p._id.toString(),
  status: p.status,
  createdAt: p.createdAt,
  branchId: toId(p.branchId),
  branchName: p.branchId?.name || null,
  supplierId: toId(p.supplierId),
  supplierName: p.supplierId?.name || null,
  notes: p.notes,
  items: (p.items || []).map(i => ({
    id: i._id.toString(),
    productId: toId(i.productId),
    productName: i.productId?.name || null,
    perishable: i.productId?.perishable !== false,
    quantity: i.quantity,
    lotNumber: i.lotNumber,
    expirationDate: i.expirationDate,
    brandId: toId(i.brandId),
    brandName: i.brandId?.name || null,
    // Unidades del lote que ya salieron (solo aprobadas): no se puede bajar la cantidad por debajo de eso
    used: i.stockEntryId && typeof i.stockEntryId === 'object'
      ? i.stockEntryId.quantity - (i.stockEntryId.remaining ?? i.stockEntryId.quantity)
      : 0
  })),
  totalUnits: (p.items || []).reduce((sum, i) => sum + i.quantity, 0),
  createdByName: userName(p.createdBy),
  approvedByName: userName(p.approvedBy),
  approvedAt: p.approvedAt,
  editedAt: p.editedAt,
  editedByName: userName(p.editedBy)
});

const populateAll = (query) => query
  .populate('items.productId', 'name perishable')
  .populate('items.stockEntryId', 'quantity remaining')
  .populate('items.brandId', 'name')
  .populate('branchId', 'name')
  .populate('supplierId', 'name')
  .populate('createdBy', 'username firstName lastName')
  .populate('approvedBy', 'username firstName lastName')
  .populate('editedBy', 'username firstName lastName');

// Lote y vencimiento: obligatorios para productos que vencen (como en cualquier ingreso)
const lotError = (product, lotNumber, expirationDate) => (
  product.perishable !== false && !(lotNumber && expirationDate)
    ? `"${product.name}" tiene vencimiento: indicá el número de lote y la fecha de vencimiento.`
    : null
);

const itemsText = (items, productsById) => items
  .map(i => `${i.quantity} u. de "${productsById.get(String(i.productId))?.name || 'producto'}"${i.lotNumber ? ` (lote ${i.lotNumber})` : ''}`)
  .join(', ');

/**
 * GET /api/inventory/provisions?branchId&status&page&limit
 * Admin: todas (o la sucursal elegida). Responsable: su sucursal. Proveedor: lo que entregó él.
 */
const getProvisions = async (req, res) => {
  try {
    const filter = {};
    if (['PENDIENTE', 'APROBADA'].includes(req.query.status)) filter.status = req.query.status;
    if (req.user.role === 'Administrador') {
      if (req.query.branchId) filter.branchId = req.query.branchId;
    } else if (req.user.role === 'Proveedor') {
      const me = await User.findById(req.user.id).select('supplierId').lean();
      if (!me?.supplierId) return res.json({ items: [], total: 0, pending: 0, page: 1, pages: 1 });
      filter.supplierId = me.supplierId;
    } else {
      const ownBranch = await effectiveBranchId(req.user);
      if (!ownBranch) return res.json({ items: [], total: 0, pending: 0, page: 1, pages: 1 });
      filter.branchId = ownBranch;
    }

    const { page, limit, skip } = parsePagination(req.query, 15);
    const statusFilter = { ...filter };
    delete statusFilter.status;
    const [rows, total, pending] = await Promise.all([
      populateAll(Provision.find(filter)).sort({ status: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Provision.countDocuments(filter),
      Provision.countDocuments({ ...statusFilter, status: 'PENDIENTE' })
    ]);
    res.json({ items: rows.map(format), total, pending, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo las provisiones', error: error.message });
  }
};

/**
 * POST /api/inventory/provisions
 * { branchId, supplierId?, notes?, items: [{ productId, quantity, lotNumber?, expirationDate? }] }
 * Carga una provisión pendiente con todos sus productos. No mueve stock.
 */
const createProvision = async (req, res) => {
  try {
    const { branchId, supplierId, notes } = req.body;
    const items = (req.body.items || []).map(i => ({
      productId: i.productId,
      quantity: parseInt(i.quantity, 10),
      lotNumber: i.lotNumber ? String(i.lotNumber).trim() : null,
      expirationDate: i.expirationDate || null,
      brandId: i.brandId || null
    }));

    const brandIds = [...new Set(items.map(i => i.brandId).filter(Boolean).map(String))];
    const [branch, supplier, products, brandCount] = await Promise.all([
      PhysicalSpace.findById(branchId).lean(),
      supplierId ? Supplier.findById(supplierId).lean() : null,
      Product.find({ _id: { $in: items.map(i => i.productId) } }).lean(),
      brandIds.length ? Brand.countDocuments({ _id: { $in: brandIds } }) : 0
    ]);
    if (brandCount !== brandIds.length) return res.status(404).json({ message: 'Marca no encontrada' });
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });
    if (supplierId && !supplier) return res.status(404).json({ message: 'Proveedor no encontrado' });
    if (!(await canAccessBranch(req.user, branchId))) {
      return res.status(403).json({ message: 'Solo podés cargar provisiones para tu sucursal' });
    }
    const productsById = new Map(products.map(p => [p._id.toString(), p]));
    for (const item of items) {
      const product = productsById.get(String(item.productId));
      if (!product) return res.status(404).json({ message: 'Producto no encontrado' });
      const err = lotError(product, item.lotNumber, item.expirationDate);
      if (err) return res.status(400).json({ message: err });
      if (!(item.lotNumber && item.expirationDate)) { item.lotNumber = null; item.expirationDate = null; }
    }

    const provision = await Provision.create({
      branchId,
      supplierId: supplierId || null,
      notes: notes || null,
      items,
      createdBy: req.user.id
    });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'CREATE_PROVISION',
      details: `Cargó una provisión para "${branch.name}"${supplier ? ` del proveedor "${supplier.name}"` : ''}: ${itemsText(items, productsById)}. Queda pendiente de aprobación.`
    });

    res.status(201).json(format(await populateAll(Provision.findById(provision._id)).lean()));
  } catch (error) {
    res.status(500).json({ message: 'Error cargando la provisión', error: error.message });
  }
};

/**
 * POST /api/inventory/provisions/:id/approve
 * Aprueba la provisión: por cada producto crea el lote, suma el stock y registra el movimiento de INGRESO.
 */
const approveProvision = async (req, res) => {
  try {
    const current = await Provision.findById(req.params.id).lean();
    if (!current) return res.status(404).json({ message: 'Provisión no encontrada' });
    if (!(await canAccessBranch(req.user, current.branchId))) {
      return res.status(403).json({ message: 'Solo podés aprobar provisiones de tu sucursal' });
    }

    // Se marca aprobada de forma atómica: dos clics o dos usuarios no la ingresan dos veces
    const provision = await Provision.findOneAndUpdate(
      { _id: current._id, status: 'PENDIENTE' },
      { $set: { status: 'APROBADA', approvedBy: req.user.id, approvedAt: new Date() } },
      { returnDocument: 'after' }
    ).lean();
    if (!provision) return res.status(400).json({ message: 'La provisión ya estaba aprobada' });

    const [branch, supplier, products] = await Promise.all([
      PhysicalSpace.findById(provision.branchId).lean(),
      provision.supplierId ? Supplier.findById(provision.supplierId).lean() : null,
      Product.find({ _id: { $in: provision.items.map(i => i.productId) } }).lean()
    ]);
    const productsById = new Map(products.map(p => [p._id.toString(), p]));

    const links = {};
    for (const [index, item] of provision.items.entries()) {
      const lot = item.lotNumber && item.expirationDate
        ? await stock.createLot({
          productId: item.productId,
          branchId: provision.branchId,
          lotNumber: item.lotNumber,
          expirationDate: item.expirationDate,
          quantity: item.quantity,
          supplierId: provision.supplierId,
          brandId: item.brandId || null,
          registeredBy: req.user.id
        })
        : null;
      await stock.increaseStock(provision.branchId, item.productId, item.quantity);
      const movement = await stock.recordMovement({
        type: 'INGRESO',
        subtype: 'PROVISION',
        branchId: provision.branchId,
        productId: item.productId,
        quantity: item.quantity,
        lotNumber: item.lotNumber,
        expirationDate: item.expirationDate,
        supplierId: provision.supplierId,
        brandId: item.brandId || null,
        stockEntryId: lot?._id || null,
        reason: 'Provisión aprobada',
        userId: req.user.id
      });
      links[`items.${index}.stockEntryId`] = lot?._id || null;
      links[`items.${index}.movementId`] = movement._id;
    }
    await Provision.updateOne({ _id: provision._id }, { $set: links });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'APPROVE_PROVISION',
      details: `Aprobó una provisión: ingresaron a "${branch?.name}"${supplier ? ` (proveedor "${supplier.name}")` : ''} ${itemsText(provision.items, productsById)}.`
    });

    res.json(format(await populateAll(Provision.findById(provision._id)).lean()));
  } catch (error) {
    res.status(500).json({ message: 'Error aprobando la provisión', error: error.message });
  }
};

/**
 * PUT /api/inventory/provisions/:id
 * { supplierId?, notes?, reason?, items?: [{ id, quantity?, lotNumber?, expirationDate? }] }
 * Pendiente: se corrigen los datos sin tocar el stock.
 * Aprobada: además se corrigen, producto por producto, el lote, el stock (por la diferencia) y el movimiento.
 * Se valida todo antes de tocar nada; si algo falla a mitad de camino se deshace lo aplicado.
 */
const updateProvision = async (req, res) => {
  try {
    const provision = await Provision.findById(req.params.id).lean();
    if (!provision) return res.status(404).json({ message: 'Provisión no encontrada' });
    if (!(await canAccessBranch(req.user, provision.branchId))) {
      return res.status(403).json({ message: 'Solo podés modificar provisiones de tu sucursal' });
    }

    const { reason } = req.body;
    const approved = provision.status === 'APROBADA';
    if (approved && !reason) {
      return res.status(400).json({ message: 'La provisión ya ingresó al stock: indicá el motivo de la corrección.' });
    }

    const newSupplierId = req.body.supplierId !== undefined ? (req.body.supplierId || null) : toId(provision.supplierId);
    const newNotes = req.body.notes !== undefined ? (req.body.notes || null) : provision.notes;
    let supplier = null;
    if (newSupplierId) {
      supplier = await Supplier.findById(newSupplierId).lean();
      if (!supplier) return res.status(404).json({ message: 'Proveedor no encontrado' });
    }

    const products = await Product.find({ _id: { $in: provision.items.map(i => i.productId) } }).lean();
    const brandIdsSent = [...new Set((req.body.items || []).map(i => i.brandId).filter(Boolean).map(String))];
    const brands = brandIdsSent.length || provision.items.some(i => i.brandId)
      ? await Brand.find({ _id: { $in: [...brandIdsSent, ...provision.items.map(i => i.brandId).filter(Boolean)] } }).lean()
      : [];
    const brandsById = new Map(brands.map(b => [b._id.toString(), b]));
    if (brandIdsSent.some(id => !brandsById.has(id))) return res.status(404).json({ message: 'Marca no encontrada' });
    const productsById = new Map(products.map(p => [p._id.toString(), p]));
    const editsById = new Map((req.body.items || []).map(i => [String(i.id), i]));
    for (const id of editsById.keys()) {
      if (!provision.items.some(i => i._id.toString() === id)) {
        return res.status(404).json({ message: 'Uno de los productos no pertenece a esta provisión' });
      }
    }

    // Estado nuevo de cada producto
    const plan = provision.items.map(item => {
      const edit = editsById.get(item._id.toString()) || {};
      return {
        item,
        product: productsById.get(String(item.productId)),
        newQty: edit.quantity !== undefined ? parseInt(edit.quantity, 10) : item.quantity,
        newLot: edit.lotNumber !== undefined ? (String(edit.lotNumber).trim() || null) : item.lotNumber,
        newExp: edit.expirationDate !== undefined ? (edit.expirationDate || null) : item.expirationDate,
        newBrand: edit.brandId !== undefined ? (edit.brandId || null) : (item.brandId ? String(item.brandId) : null)
      };
    });

    // Validaciones antes de tocar nada
    const lotsById = new Map();
    if (approved) {
      const lotIds = provision.items.map(i => i.stockEntryId).filter(Boolean);
      (await StockEntry.find({ _id: { $in: lotIds } }).lean()).forEach(l => lotsById.set(l._id.toString(), l));
    }
    for (const step of plan) {
      if (!step.product) return res.status(404).json({ message: 'Producto no encontrado' });
      if (!step.newQty || step.newQty < 1) return res.status(400).json({ message: `La cantidad de "${step.product.name}" debe ser mayor a 0.` });
      const err = lotError(step.product, step.newLot, step.newExp);
      if (err) return res.status(400).json({ message: err });
      step.delta = step.newQty - step.item.quantity;
      step.lot = step.item.stockEntryId ? lotsById.get(step.item.stockEntryId.toString()) : null;
      if (approved && step.lot) {
        const used = step.lot.quantity - (step.lot.remaining ?? step.lot.quantity);
        if (step.newQty < used) {
          return res.status(400).json({ message: `De "${step.product.name}" ya salieron ${used} u.; la cantidad no puede ser menor a ${used}.` });
        }
      }
    }

    if (approved) {
      const undo = [];
      const rollback = async () => { for (const fn of undo.reverse()) await fn(); };
      for (const step of plan) {
        const { item, delta, lot, newLot, newExp } = step;
        // Stock de la sucursal por la diferencia (atómico, respeta lo reservado para pedidos)
        if (delta < 0) {
          const ok = await stock.decreaseAvailableStock(provision.branchId, item.productId, -delta);
          if (!ok) {
            await rollback();
            const cur = await BranchStock.findOne({ branchId: provision.branchId, productId: item.productId }).lean();
            return res.status(400).json({ message: `No se pueden quitar ${-delta} u. de "${step.product.name}": hay ${cur?.quantity || 0} en stock y ${cur?.reservedQuantity || 0} reservadas para pedidos.` });
          }
          undo.push(() => stock.increaseStock(provision.branchId, item.productId, -delta));
        } else if (delta > 0) {
          await stock.increaseStock(provision.branchId, item.productId, delta);
          undo.push(() => stock.decreaseAvailableStock(provision.branchId, item.productId, delta));
        }

        if (lot) {
          const expDate = new Date(newExp);
          const lotFilter = { _id: lot._id };
          if (delta < 0) lotFilter.remaining = { $gte: -delta };
          const remainingAfter = { $add: ['$remaining', delta] };
          const updatedLot = await StockEntry.findOneAndUpdate(lotFilter, [{
            $set: {
              quantity: { $add: ['$quantity', delta] },
              remaining: remainingAfter,
              lotNumber: newLot,
              expirationDate: expDate,
              supplierId: newSupplierId,
              brandId: step.newBrand,
              status: { $cond: [{ $lte: [remainingAfter, 0] }, 'AGOTADO', { $cond: [{ $lt: [expDate, todayAsUTCDate()] }, 'VENCIDO', 'DISPONIBLE'] }] }
            }
          }], { returnDocument: 'after', updatePipeline: true });
          if (!updatedLot) {
            await rollback();
            return res.status(409).json({ message: `El lote de "${step.product.name}" cambió mientras se modificaba. Volvé a abrir la provisión e intentá de nuevo.` });
          }
          undo.push(() => StockEntry.updateOne({ _id: lot._id }, {
            $set: { quantity: lot.quantity, remaining: lot.remaining, lotNumber: lot.lotNumber, expirationDate: lot.expirationDate, supplierId: lot.supplierId, status: lot.status }
          }));
        }
      }

      for (const step of plan) {
        if (!step.item.movementId) continue;
        await StockMovement.updateOne({ _id: step.item.movementId }, {
          $set: { quantity: step.newQty, lotNumber: step.newLot, expirationDate: step.newExp, supplierId: newSupplierId, brandId: step.newBrand, editedAt: new Date(), editedBy: req.user.id }
        });
      }
    }

    const set = { supplierId: newSupplierId, notes: newNotes, editedAt: new Date(), editedBy: req.user.id };
    plan.forEach((step, index) => {
      set[`items.${index}.quantity`] = step.newQty;
      set[`items.${index}.lotNumber`] = step.newLot;
      set[`items.${index}.expirationDate`] = step.newExp;
      set[`items.${index}.brandId`] = step.newBrand;
    });
    await Provision.updateOne({ _id: provision._id }, { $set: set });

    const changes = [];
    for (const step of plan) {
      const name = step.product.name;
      if (step.delta) changes.push(`${name}: cantidad ${step.item.quantity} → ${step.newQty}`);
      if ((step.newLot || null) !== (step.item.lotNumber || null)) changes.push(`${name}: lote ${step.item.lotNumber || '—'} → ${step.newLot || '—'}`);
      if (dateOnly(step.newExp) !== dateOnly(step.item.expirationDate)) changes.push(`${name}: vencimiento ${dateOnly(step.item.expirationDate)} → ${dateOnly(step.newExp)}`);
      const oldBrand = step.item.brandId ? String(step.item.brandId) : null;
      if ((step.newBrand || null) !== oldBrand) {
        changes.push(`${name}: marca ${brandsById.get(oldBrand)?.name || '—'} → ${brandsById.get(step.newBrand)?.name || '—'}`);
      }
    }
    if (String(newSupplierId || '') !== String(toId(provision.supplierId) || '')) changes.push(`proveedor → ${supplier?.name || 'sin proveedor'}`);
    if ((newNotes || null) !== (provision.notes || null)) changes.push('notas');

    await ActivityLog.create({
      userId: req.user.id,
      action: 'EDIT_PROVISION',
      details: `Modificó una provisión ${approved ? 'aprobada' : 'pendiente'}: ${changes.join(', ') || 'sin cambios'}.${reason ? ` Motivo: ${reason}` : ''}`
    });

    res.json({ message: 'Provisión modificada', changes, provision: format(await populateAll(Provision.findById(provision._id)).lean()) });
  } catch (error) {
    res.status(500).json({ message: 'Error modificando la provisión', error: error.message });
  }
};

module.exports = { getProvisions, createProvision, approveProvision, updateProvision };
