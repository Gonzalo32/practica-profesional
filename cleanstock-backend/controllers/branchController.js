const { PhysicalSpace, BranchStock, Product, User, ActivityLog, StockEntry, StockMovement } = require('../models');
const stock = require('../services/stockService');
const { toId, parsePagination, startOfDay } = require('../utils/format');
const { getSettings } = require('../services/settingsService');

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

    const settings = await getSettings();
    if (settings.singleBranchMode && String(settings.mainBranchId) === String(id)) {
      return res.status(400).json({ message: 'No se puede eliminar el local principal mientras el negocio trabaja en modo de un solo local.' });
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

    // Enriquecer con cantidad disponible y mínimo efectivo
    const enrichedItems = stockItems.map(item => {
      const productObj = item.productId && typeof item.productId === 'object' ? item.productId : null;
      const categoryObj = productObj && productObj.categoryId && typeof productObj.categoryId === 'object' ? productObj.categoryId : null;

      const effectiveMin = item.branchMinStock !== null && item.branchMinStock !== undefined
        ? item.branchMinStock
        : (productObj?.minimumStock || 0);
      const reserved = item.reservedQuantity || 0;
      const available = Math.max(0, item.quantity - reserved);
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
        nextExpiration: lots ? lots.nextExpiration : null,
        lotCount: lots ? lots.lots : 0,
        Producto: productObj ? {
          id: productObj._id.toString(),
          _id: productObj._id.toString(),
          name: productObj.name,
          sku: productObj.sku || null,
          perishable: productObj.perishable !== false,
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

    // Varias variantes (lotes) en un solo ajuste: [{ lotId, quantity }]. lotId vacío = stock general.
    // También se acepta el formato simple { quantity, lotId }.
    const lines = (Array.isArray(req.body.adjustments)
      ? req.body.adjustments
      : [{ lotId: req.body.lotId, quantity: req.body.quantity }])
      .map(l => ({ lotId: l.lotId ? String(l.lotId) : null, quantity: parseInt(l.quantity, 10) || 0 }))
      .filter(l => l.quantity !== 0);

    if (!lines.length) {
      return res.status(400).json({ message: 'La cantidad del ajuste no puede ser 0' });
    }
    const lotIds = lines.filter(l => l.lotId).map(l => l.lotId);
    if (new Set(lotIds).size !== lotIds.length) {
      return res.status(400).json({ message: 'Hay un lote repetido en el ajuste' });
    }
    if (lines.filter(l => !l.lotId).length > 1) {
      return res.status(400).json({ message: 'El ajuste sin lote se indica una sola vez' });
    }

    const [branch, product, lotDocs] = await Promise.all([
      PhysicalSpace.findById(id),
      Product.findById(productId),
      lotIds.length ? StockEntry.find({ _id: { $in: lotIds }, branchId: id, productId }).lean() : []
    ]);
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });
    if (lotDocs.length !== lotIds.length) {
      return res.status(404).json({ message: 'El lote no corresponde a ese producto en esta sucursal' });
    }
    const lotsById = new Map(lotDocs.map(l => [l._id.toString(), l]));

    // Se valida todo antes de tocar nada
    for (const line of lines) {
      const lot = line.lotId && lotsById.get(line.lotId);
      if (lot && line.quantity < 0 && -line.quantity > lot.remaining) {
        return res.status(400).json({ message: `El lote ${lot.lotNumber} tiene ${lot.remaining} u.; no se pueden descontar ${-line.quantity}.` });
      }
    }

    // 1) Total de la sucursal: se mueve una sola vez por la diferencia neta (atómico, respeta lo reservado)
    const net = lines.reduce((sum, l) => sum + l.quantity, 0);
    let stockRecord;
    if (net < 0) {
      stockRecord = await stock.decreaseAvailableStock(id, productId, -net);
      if (!stockRecord) {
        const current = await BranchStock.findOne({ branchId: id, productId }).lean();
        return res.status(400).json({
          message: `Stock insuficiente. Stock actual: ${current?.quantity || 0}, reservado para pedidos: ${current?.reservedQuantity || 0}, ajuste solicitado: ${net}`
        });
      }
    } else if (net > 0) {
      stockRecord = await stock.increaseStock(id, productId, net);
    } else {
      stockRecord = await BranchStock.findOne({ branchId: id, productId });
    }

    // 2) Cada lote elegido. Si uno falla (otro usuario lo modificó recién), se deshace todo.
    const applied = [];
    const undo = async () => {
      for (const a of applied) {
        await StockEntry.updateOne({ _id: a.lot._id }, { $inc: { remaining: -a.quantity }, $set: { status: a.lot.status } });
      }
      if (net < 0) await stock.increaseStock(id, productId, -net);
      else if (net > 0) await stock.decreaseAvailableStock(id, productId, net);
    };
    for (const line of lines.filter(l => l.lotId)) {
      const lot = lotsById.get(line.lotId);
      const newRemaining = { $add: ['$remaining', line.quantity] };
      const updated = await StockEntry.findOneAndUpdate(
        { _id: lot._id, remaining: { $gte: Math.max(0, -line.quantity) } },
        [{ $set: {
          remaining: newRemaining,
          status: { $cond: [{ $eq: [newRemaining, 0] }, 'AGOTADO', { $cond: [{ $eq: ['$status', 'AGOTADO'] }, 'DISPONIBLE', '$status'] }] }
        } }],
        { returnDocument: 'after', updatePipeline: true }
      );
      if (!updated) {
        await undo();
        return res.status(409).json({ message: `El lote ${lot.lotNumber} cambió mientras se ajustaba. Volvé a abrir el ajuste e intentá de nuevo.` });
      }
      applied.push({ lot, quantity: line.quantity });
    }

    // 3) Ajuste general (sin lote): si resta, descuenta del lote que vence primero
    const general = lines.find(l => !l.lotId);
    let generalLots = [];
    if (general && general.quantity < 0) {
      generalLots = await stock.consumeLots(id, productId, -general.quantity);
    }

    // Un movimiento por variante, para la trazabilidad
    for (const line of lines) {
      const lot = line.lotId && lotsById.get(line.lotId);
      await stock.recordMovement({
        type: 'AJUSTE',
        branchId: id,
        productId,
        quantity: line.quantity,
        lotNumber: lot ? lot.lotNumber : (generalLots.map(l => l.lotNumber).join(', ') || null),
        reason: reason || 'Sin motivo',
        userId: req.user.id
      });
    }

    const detail = lines.map(l => {
      const lot = l.lotId && lotsById.get(l.lotId);
      return `${l.quantity > 0 ? '+' : ''}${l.quantity}${lot ? ` (lote ${lot.lotNumber})` : lines.length > 1 ? ' (sin lote)' : ''}`;
    }).join(', ');
    await ActivityLog.create({
      userId: req.user.id,
      action: net >= 0 ? 'STOCK_ENTRY' : 'STOCK_EXIT',
      details: `Ajuste manual de stock de "${product.name}" en sucursal "${branch.name}": ${detail} unidades. Motivo: ${reason || 'Sin motivo'}`
    });

    res.json({ message: 'Stock ajustado correctamente', stockRecord, adjusted: lines.length });
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
