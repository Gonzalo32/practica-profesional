const { Supplier, Product, ActivityLog, PurchaseOrder, PhysicalSpace, nextSequence } = require('../models');
const stock = require('../services/stockService');
const { toId, formatPurchaseOrderCode } = require('../utils/format');

const formatSupplier = (s) => ({
  id: s._id.toString(),
  name: s.name,
  cuit: s.cuit,
  contactName: s.contactName,
  email: s.email,
  phone: s.phone,
  address: s.address,
  notes: s.notes,
  isActive: s.isActive,
  productIds: (s.productIds || []).map(toId),
  Products: (s.productIds || []).filter(p => p && typeof p === 'object' && p.name).map(p => ({ id: p._id.toString(), name: p.name })),
  createdAt: s.createdAt
});

// GET /api/suppliers  (?all=true incluye los dados de baja)
const getSuppliers = async (req, res) => {
  try {
    const filter = req.query.all === 'true' ? {} : { isActive: true };
    // El rol Proveedor solo ve su propia empresa
    if (req.user.role === 'Proveedor') {
      if (!req.user.supplierId) return res.json([]);
      filter._id = req.user.supplierId;
    }
    const suppliers = await Supplier.find(filter).populate('productIds', 'name').sort({ name: 1 }).lean();
    res.json(suppliers.map(formatSupplier));
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo proveedores', error: error.message });
  }
};

const pickSupplierFields = (body) => {
  const data = {};
  ['name', 'cuit', 'contactName', 'email', 'phone', 'address', 'notes'].forEach(field => {
    if (body[field] !== undefined) data[field] = body[field] === '' ? null : body[field];
  });
  if (body.productIds !== undefined) data.productIds = body.productIds;
  return data;
};

const duplicateSupplierMessage = (error) => (
  Object.keys(error.keyPattern || {})[0] === 'cuit'
    ? 'Ya existe un proveedor con ese CUIT.'
    : 'Ya existe un proveedor con esa razón social.'
);

const createSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.create(pickSupplierFields(req.body));
    await ActivityLog.create({
      userId: req.user.id,
      action: 'CREATE_SUPPLIER',
      details: `Registró el proveedor "${supplier.name}"`
    });
    res.status(201).json(formatSupplier(supplier));
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: duplicateSupplierMessage(error) });
    res.status(500).json({ message: 'Error creando proveedor', error: error.message });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, pickSupplierFields(req.body), { returnDocument: 'after', runValidators: true });
    if (!supplier) return res.status(404).json({ message: 'Proveedor no encontrado' });
    await ActivityLog.create({
      userId: req.user.id,
      action: 'UPDATE_SUPPLIER',
      details: `Actualizó el proveedor "${supplier.name}"`
    });
    res.json(formatSupplier(supplier));
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: duplicateSupplierMessage(error) });
    res.status(500).json({ message: 'Error actualizando proveedor', error: error.message });
  }
};

// Baja lógica: el proveedor deja de aparecer pero se conserva su historial
const deactivateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, { isActive: false }, { returnDocument: 'after' });
    if (!supplier) return res.status(404).json({ message: 'Proveedor no encontrado' });
    await ActivityLog.create({
      userId: req.user.id,
      action: 'DEACTIVATE_SUPPLIER',
      details: `Dio de baja al proveedor "${supplier.name}"`
    });
    res.json({ message: 'Proveedor dado de baja' });
  } catch (error) {
    res.status(500).json({ message: 'Error dando de baja el proveedor', error: error.message });
  }
};

// ─── Órdenes de compra ───────────────────────────────────────────────────────

const formatPurchaseOrder = (po) => ({
  id: po._id.toString(),
  number: po.number,
  code: formatPurchaseOrderCode(po),
  status: po.status,
  notes: po.notes,
  supplierId: toId(po.supplierId),
  supplierName: po.supplierId?.name || null,
  branchId: toId(po.branchId),
  branchName: po.branchId?.name || null,
  createdBy: po.createdBy && typeof po.createdBy === 'object'
    ? { firstName: po.createdBy.firstName, lastName: po.createdBy.lastName, username: po.createdBy.username }
    : null,
  receivedAt: po.receivedAt,
  createdAt: po.createdAt,
  items: (po.items || []).map(i => ({
    productId: toId(i.productId),
    productName: i.productId?.name || null,
    perishable: i.productId?.perishable !== false,
    quantity: i.quantity,
    unitCost: i.unitCost
  })),
  total: (po.items || []).reduce((acc, i) => acc + i.quantity * (i.unitCost || 0), 0)
});

const populatePurchaseOrder = (query) => query
  .populate('supplierId', 'name')
  .populate('branchId', 'name')
  .populate('items.productId', 'name perishable')
  .populate('createdBy', 'firstName lastName username');

// GET /api/suppliers/purchase-orders  (?status &supplierId)
const getPurchaseOrders = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.supplierId) filter.supplierId = req.query.supplierId;
    if (req.user.role === 'Proveedor') {
      if (!req.user.supplierId) return res.json([]);
      filter.supplierId = req.user.supplierId;
    }
    const orders = await populatePurchaseOrder(PurchaseOrder.find(filter).sort({ createdAt: -1 })).lean();
    res.json(orders.map(formatPurchaseOrder));
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo órdenes de compra', error: error.message });
  }
};

const createPurchaseOrder = async (req, res) => {
  try {
    const { supplierId, branchId, notes, items } = req.body;
    const [supplier, branch, productCount] = await Promise.all([
      Supplier.findOne({ _id: supplierId, isActive: true }),
      PhysicalSpace.findById(branchId),
      Product.countDocuments({ _id: { $in: items.map(i => i.productId) } })
    ]);
    if (!supplier) return res.status(404).json({ message: 'Proveedor no encontrado o dado de baja' });
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });
    if (productCount !== new Set(items.map(i => String(i.productId))).size) {
      return res.status(400).json({ message: 'Uno o más productos no existen' });
    }

    const po = await PurchaseOrder.create({
      number: await nextSequence('purchaseOrder'),
      supplierId,
      branchId,
      notes: notes || null,
      items: items.map(i => ({
        productId: i.productId,
        quantity: parseInt(i.quantity, 10),
        unitCost: i.unitCost !== undefined && i.unitCost !== null && i.unitCost !== '' ? Number(i.unitCost) : null
      })),
      createdBy: req.user.id
    });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'CREATE_PURCHASE_ORDER',
      details: `Generó la orden de compra ${formatPurchaseOrderCode(po)} al proveedor "${supplier.name}" para "${branch.name}"`
    });

    const populated = await populatePurchaseOrder(PurchaseOrder.findById(po._id)).lean();
    res.status(201).json(formatPurchaseOrder(populated));
  } catch (error) {
    res.status(500).json({ message: 'Error creando la orden de compra', error: error.message });
  }
};

// POST /api/suppliers/purchase-orders/:id/receive
// body: { lots: [{ productId, lotNumber, expirationDate }] } — lote y vencimiento por producto.
// Solo son obligatorios para los productos perecederos.
const receivePurchaseOrder = async (req, res) => {
  try {
    const lots = req.body.lots || [];
    const lotFor = (productId) => {
      const lot = lots.find(l => String(l.productId) === String(productId));
      return lot && lot.lotNumber && lot.expirationDate ? lot : null;
    };

    const pending = await PurchaseOrder.findById(req.params.id).populate('items.productId', 'name perishable');
    if (!pending) return res.status(404).json({ message: 'Orden de compra no encontrada' });
    if (pending.status !== 'PENDIENTE') return res.status(400).json({ message: `La orden ya está ${pending.status.toLowerCase()}` });

    for (const item of pending.items) {
      if (item.productId?.perishable !== false && !lotFor(item.productId?._id)) {
        return res.status(400).json({ message: `"${item.productId?.name || 'Producto'}" tiene vencimiento: indicá el lote y la fecha de vencimiento.` });
      }
    }

    // Cambio de estado atómico: evita recibir dos veces la misma orden
    const po = await PurchaseOrder.findOneAndUpdate(
      { _id: req.params.id, status: 'PENDIENTE' },
      { $set: { status: 'RECIBIDA', receivedBy: req.user.id, receivedAt: new Date() } },
      { returnDocument: 'after' }
    ).populate('supplierId', 'name').populate('branchId', 'name');
    if (!po) return res.status(409).json({ message: 'La orden fue modificada por otro usuario' });

    const code = formatPurchaseOrderCode(po);
    for (const item of po.items) {
      const lot = lotFor(item.productId);
      if (lot) {
        await stock.createLot({
          productId: item.productId,
          branchId: po.branchId._id,
          lotNumber: lot.lotNumber,
          expirationDate: lot.expirationDate,
          quantity: item.quantity,
          supplierId: po.supplierId._id,
          unitCost: item.unitCost,
          registeredBy: req.user.id
        });
      }
      await stock.increaseStock(po.branchId._id, item.productId, item.quantity);
      if (item.unitCost !== null && item.unitCost !== undefined) {
        await Product.updateOne({ _id: item.productId }, { costPrice: item.unitCost });
      }
      await stock.recordMovement({
        type: 'INGRESO',
        subtype: 'ORDEN_COMPRA',
        branchId: po.branchId._id,
        productId: item.productId,
        quantity: item.quantity,
        lotNumber: lot ? lot.lotNumber : null,
        expirationDate: lot ? lot.expirationDate : null,
        supplierId: po.supplierId._id,
        unitCost: item.unitCost,
        purchaseOrderId: po._id,
        reason: `Recepción de ${code}`,
        userId: req.user.id
      });
    }

    await ActivityLog.create({
      userId: req.user.id,
      action: 'RECEIVE_PURCHASE_ORDER',
      details: `Recibió la orden de compra ${code} del proveedor "${po.supplierId.name}" en "${po.branchId.name}"`
    });

    res.json({ message: `Orden ${code} recibida e ingresada al stock` });
  } catch (error) {
    res.status(500).json({ message: 'Error recibiendo la orden de compra', error: error.message });
  }
};

const cancelPurchaseOrder = async (req, res) => {
  try {
    const po = await PurchaseOrder.findOneAndUpdate(
      { _id: req.params.id, status: 'PENDIENTE' },
      { $set: { status: 'CANCELADA' } },
      { returnDocument: 'after' }
    );
    if (!po) return res.status(400).json({ message: 'Solo se pueden cancelar órdenes pendientes' });
    await ActivityLog.create({
      userId: req.user.id,
      action: 'CANCEL_PURCHASE_ORDER',
      details: `Canceló la orden de compra ${formatPurchaseOrderCode(po)}`
    });
    res.json({ message: 'Orden de compra cancelada' });
  } catch (error) {
    res.status(500).json({ message: 'Error cancelando la orden de compra', error: error.message });
  }
};

module.exports = {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deactivateSupplier,
  getPurchaseOrders,
  createPurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder
};
