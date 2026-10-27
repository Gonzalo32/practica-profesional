const { PhysicalSpace, BranchStock, Product, User, ActivityLog, StockEntry, StockMovement } = require('../models');
const stock = require('../services/stockService');
const { toId, parsePagination, startOfDay } = require('../utils/format');

// Obtener todas las sucursales
const getBranches = async (req, res) => {
  try {
    const branches = await PhysicalSpace.find().sort({ name: 1 }).lean();
    const formatted = branches.map(b => ({
      ...b,
      id: b._id.toString()
    }));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo sucursales', error: error.message });
  }
};

// Crear una nueva sucursal
const createBranch = async (req, res) => {
  try {
    const { name, description, address, phone, type } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'El nombre de la sucursal es obligatorio' });
    }

    const branch = await PhysicalSpace.create({
      name,
      description: description || null,
      address: address || null,
      phone: phone || null,
      type: type || 'sucursal'
    });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'CREATE_BRANCH',
      details: `Administrador creó la sucursal "${name}"`
    });

    res.status(201).json(branch);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Ya existe una sucursal con ese nombre.' });
    }
    console.error('Error creando sucursal:', error);
    res.status(500).json({ message: 'Error creando sucursal', error: error.message });
  }
};

// Eliminar una sucursal
const deleteBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const branch = await PhysicalSpace.findById(id);

    if (!branch) {
      return res.status(404).json({ message: 'Sucursal no encontrada' });
    }

    // Desasociar usuarios antes de eliminar
    await User.updateMany({ physicalSpaceId: id }, { physicalSpaceId: null });

    // Eliminar stock asociado
    await BranchStock.deleteMany({ branchId: id });

    const branchName = branch.name;
    await PhysicalSpace.findByIdAndDelete(id);

    await ActivityLog.create({
      userId: req.user.id,
      action: 'DELETE_BRANCH',
      details: `Administrador eliminó la sucursal "${branchName}"`
    });

    res.json({ message: 'Sucursal eliminada exitosamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error eliminando sucursal', error: error.message });
  }
};

// Actualizar una sucursal
const updateBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, address, type } = req.body;

    const branch = await PhysicalSpace.findById(id);
    if (!branch) {
      return res.status(404).json({ message: 'Sucursal no encontrada' });
    }

    if (name) {
      const nameExists = await PhysicalSpace.findOne({ name });
      if (nameExists && nameExists._id.toString() !== id) {
        return res.status(400).json({ message: 'Ya existe otra sucursal con ese nombre' });
      }
      branch.name = name;
    }

    if (description !== undefined) branch.description = description;
    if (address !== undefined) branch.address = address;
    if (req.body.phone !== undefined) branch.phone = req.body.phone;
    if (type) branch.type = type;

    await branch.save();

    await ActivityLog.create({
      userId: req.user.id,
      action: 'UPDATE_BRANCH',
      details: `Administrador actualizó la sucursal "${branch.name}"`
    });

    res.json({ message: 'Sucursal actualizada exitosamente', branch });
  } catch (error) {
    res.status(500).json({ message: 'Error actualizando sucursal', error: error.message });
  }
};
// Obtener stock de una sucursal específica
const getBranchStock = async (req, res) => {
  try {
    const { id } = req.params;

    const branch = await PhysicalSpace.findById(id);
    if (!branch) {
      return res.status(404).json({ message: 'Sucursal no encontrada' });
    }

    const [stockItems, lotsByProduct] = await Promise.all([
      BranchStock.find({ branchId: id })
        .populate({
          path: 'productId',
          populate: { path: 'categoryId' }
        })
        .lean(),
      // Próximo vencimiento de cada producto (lotes con stock)
      StockEntry.aggregate([
        { $match: { branchId: branch._id, remaining: { $gt: 0 } } },
        { $group: { _id: '$productId', nextExpiration: { $min: '$expirationDate' }, lots: { $sum: 1 } } }
      ])
    ]);
    const lotInfo = new Map(lotsByProduct.map(l => [l._id.toString(), l]));

    // Enriquecer con cantidad disponible, mínimo efectivo y valorización
    const enrichedItems = stockItems.map(item => {
      const productObj = item.productId && typeof item.productId === 'object' ? item.productId : null;
      const categoryObj = productObj && productObj.categoryId && typeof productObj.categoryId === 'object' ? productObj.categoryId : null;

      const effectiveMin = item.branchMinStock !== null && item.branchMinStock !== undefined
        ? item.branchMinStock
        : (productObj?.minimumStock || 0);
      const reserved = item.reservedQuantity || 0;
      const available = Math.max(0, item.quantity - reserved);
      const costPrice = productObj?.costPrice || 0;
      const lots = productObj ? lotInfo.get(productObj._id.toString()) : null;

      return {
        id: item._id.toString(),
        _id: item._id.toString(),
        branchId: item.branchId.toString(),
        productId: productObj ? productObj._id.toString() : item.productId,
        quantity: item.quantity,
        reservedQuantity: reserved,
        branchMinStock: item.branchMinStock,
        availableQuantity: available,
        effectiveMinStock: effectiveMin,
        isLow: item.quantity <= effectiveMin && effectiveMin > 0,
        isCritical: item.quantity === 0,
        costPrice,
        stockValue: item.quantity * costPrice,
        nextExpiration: lots ? lots.nextExpiration : null,
        lotCount: lots ? lots.lots : 0,
        Producto: productObj ? {
          id: productObj._id.toString(),
          _id: productObj._id.toString(),
          name: productObj.name,
          sku: productObj.sku || null,
          barcode: productObj.barcode || null,
          description: productObj.description,
          minimumStock: productObj.minimumStock,
          Category: categoryObj ? {
            id: categoryObj._id.toString(),
            name: categoryObj.name
          } : null
        } : null
      };
    });

    res.json({
      branch: {
        id: branch._id.toString(),
        name: branch.name,
        type: branch.type,
        address: branch.address,
        phone: branch.phone
      },
      totalValue: enrichedItems.reduce((acc, i) => acc + i.stockValue, 0),
      stockItems: enrichedItems
    });
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo stock de sucursal', error: error.message });
  }
};

// Ajustar stock manualmente en una sucursal (ingreso/egreso manual)
const adjustBranchStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { productId, reason } = req.body;
    const quantity = parseInt(req.body.quantity, 10);

    if (!quantity) {
      return res.status(400).json({ message: 'La cantidad del ajuste no puede ser 0' });
    }

    const [branch, product] = await Promise.all([
      PhysicalSpace.findById(id),
      Product.findById(productId)
    ]);
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    let stockRecord;
    let lots = [];
    if (quantity > 0) {
      stockRecord = await stock.increaseStock(id, productId, quantity);
    } else {
      // Atómico: no deja bajar por debajo de lo reservado para pedidos
      stockRecord = await stock.decreaseAvailableStock(id, productId, -quantity);
      if (!stockRecord) {
        const current = await BranchStock.findOne({ branchId: id, productId }).lean();
        const total = current ? current.quantity : 0;
        const reservedQty = current ? (current.reservedQuantity || 0) : 0;
        return res.status(400).json({
          message: `Stock insuficiente. Stock actual: ${total}, reservado para pedidos: ${reservedQty}, ajuste solicitado: ${quantity}`
        });
      }
      lots = await stock.consumeLots(id, productId, -quantity);
    }

    await stock.recordMovement({
      type: 'AJUSTE',
      branchId: id,
      productId,
      quantity,
      lotNumber: lots.map(l => l.lotNumber).join(', ') || null,
      reason: reason || 'Sin motivo',
      userId: req.user.id
    });

    await ActivityLog.create({
      userId: req.user.id,
      action: quantity > 0 ? 'STOCK_ENTRY' : 'STOCK_EXIT',
      details: `Ajuste manual de stock: ${quantity > 0 ? '+' : ''}${quantity} unidades de "${product.name}" en sucursal "${branch.name}". Motivo: ${reason || 'Sin motivo'}`
    });

    res.json({ message: 'Stock ajustado correctamente', stockRecord });
  } catch (error) {
    res.status(500).json({ message: 'Error ajustando stock', error: error.message });
  }
};

// Trazabilidad: movimientos de stock con filtros y paginación
// ?branchId &productId &type &from &to &page &limit (limit=0 trae todo para exportar)
const getStockMovements = async (req, res) => {
  try {
    const { branchId, productId, type, from, to } = req.query;
    const filter = {};

    if (branchId) filter.branchId = branchId;
    if (productId) filter.productId = productId;
    if (type) filter.type = { $in: String(type).split(',') };
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = startOfDay(from);
      if (to) {
        const end = startOfDay(to);
        end.setDate(end.getDate() + 1);
        filter.createdAt.$lt = end;
      }
    }

    const { page, limit, skip } = parsePagination(req.query, 20);

    const [movements, total] = await Promise.all([
      StockMovement.find(filter)
        .populate('userId', 'username role firstName lastName')
        .populate('productId', 'name')
        .populate('branchId', 'name')
        .populate('supplierId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StockMovement.countDocuments(filter)
    ]);

    const items = movements.map(m => ({
      id: m._id.toString(),
      type: m.type,
      subtype: m.subtype,
      quantity: m.quantity,
      lotNumber: m.lotNumber,
      expirationDate: m.expirationDate,
      unitCost: m.unitCost,
      reason: m.reason,
      createdAt: m.createdAt,
      productId: toId(m.productId),
      productName: m.productId?.name || null,
      branchId: toId(m.branchId),
      branchName: m.branchId?.name || null,
      supplierName: m.supplierId?.name || null,
      orderId: toId(m.orderId),
      User: m.userId && typeof m.userId === 'object' ? {
        username: m.userId.username,
        firstName: m.userId.firstName,
        lastName: m.userId.lastName,
        role: m.userId.role
      } : null
    }));

    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo movimientos', error: error.message });
  }
};

module.exports = {
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  getBranchStock,
  adjustBranchStock,
  getStockMovements
};
