const { Category, Product, StockEntry, ActivityLog, PhysicalSpace, Supplier } = require('../models');
const { canAccessBranch } = require('../middlewares/authMiddleware');
const { effectiveBranchId } = require('../services/settingsService');
const stock = require('../services/stockService');
const { toId, escapeRegex } = require('../utils/format');

// --- Categorías ---
const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = await Category.create({ name, description });
    res.status(201).json(category);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Ya existe una categoría con ese nombre.' });
    }
    res.status(500).json({ message: 'Error creando categoría', error: error.message });
  }
};

const getCategories = async (req, res) => {
  try {
    const categories = await Category.find().lean();
    const formatted = categories.map(c => ({
      ...c,
      id: c._id.toString()
    }));
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo categorías' });
  }
};

// --- Productos ---
const duplicateProductMessage = (error) => {
  const field = Object.keys(error.keyPattern || {})[0];
  if (field === 'sku') return 'Ya existe un producto con ese código interno.';
  return 'Ya existe un producto con ese nombre estandarizado.';
};

const createProduct = async (req, res) => {
  try {
    const { name, categoryId, description, minimumStock, sku, costPrice, perishable } = req.body;

    const product = await Product.create({
      name,
      categoryId: categoryId || null,
      description,
      minimumStock,
      sku: sku || null,
      costPrice: costPrice || 0,
      perishable: perishable !== undefined ? perishable : true
    });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'CREATE_PRODUCT',
      details: `Agregó el producto "${product.name}" al catálogo`
    });

    res.status(201).json(product);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: duplicateProductMessage(error) });
    }
    res.status(500).json({ message: 'Error creando producto', error: error.message });
  }
};

const formatProduct = (p) => ({
  id: p._id.toString(),
  _id: p._id.toString(),
  name: p.name,
  description: p.description,
  minimumStock: p.minimumStock,
  sku: p.sku || null,
  costPrice: p.costPrice || 0,
  perishable: p.perishable !== false,
  categoryId: p.categoryId ? toId(p.categoryId) : null,
  Category: p.categoryId && typeof p.categoryId === 'object' ? {
    id: p.categoryId._id.toString(),
    name: p.categoryId.name,
    description: p.categoryId.description
  } : null
});

// ?q= busca por nombre, descripción o código interno (SKU)
const getProducts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.q) {
      const regex = new RegExp(escapeRegex(req.query.q), 'i');
      filter.$or = [{ name: regex }, { description: regex }, { sku: regex }];
    }

    const products = await Product.find(filter)
      .populate('categoryId')
      .sort({ name: 1 })
      .lean();

    res.json(products.map(formatProduct));
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo productos' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, categoryId, description, minimumStock, sku, costPrice, perishable } = req.body;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    if (name) product.name = name;
    if (categoryId !== undefined) product.categoryId = categoryId || null;
    if (description !== undefined) product.description = description;
    if (minimumStock !== undefined) product.minimumStock = minimumStock;
    if (sku !== undefined) product.sku = sku || null;
    if (costPrice !== undefined) product.costPrice = costPrice || 0;
    if (perishable !== undefined) product.perishable = perishable;

    await product.save();

    await ActivityLog.create({
      userId: req.user.id,
      action: 'UPDATE_PRODUCT',
      details: `Actualizó el producto "${product.name}"`
    });

    res.json(product);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: duplicateProductMessage(error) });
    }
    res.status(500).json({ message: 'Error actualizando producto', error: error.message });
  }
};

// --- Ingresos de Stock (T3.2) ---
const registerStockEntry = async (req, res) => {
  try {
    const { productId, lotNumber, expirationDate, branchId, supplierId } = req.body;
    const quantity = parseInt(req.body.quantity, 10);
    const unitCost = req.body.unitCost !== undefined && req.body.unitCost !== null && req.body.unitCost !== ''
      ? Number(req.body.unitCost)
      : null;

    const [prod, branch, supplier] = await Promise.all([
      Product.findById(productId),
      PhysicalSpace.findById(branchId),
      supplierId ? Supplier.findById(supplierId) : null
    ]);
    if (!prod) return res.status(404).json({ message: 'Producto no encontrado' });
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });
    if (supplierId && !supplier) return res.status(404).json({ message: 'Proveedor no encontrado' });

    // Lote y vencimiento son obligatorios solo para productos perecederos
    const hasLot = !!(lotNumber && expirationDate);
    if (prod.perishable !== false && !hasLot) {
      return res.status(400).json({ message: `"${prod.name}" tiene vencimiento: indicá el número de lote y la fecha de vencimiento.` });
    }

    // Sin lote no se crea registro de lote: el stock se suma igual
    const stockEntry = hasLot
      ? await stock.createLot({
        productId,
        branchId,
        lotNumber,
        expirationDate,
        quantity,
        supplierId: supplierId || null,
        unitCost,
        registeredBy: req.user.id
      })
      : null;

    const branchStock = await stock.increaseStock(branchId, productId, quantity);

    // El último costo de compra pasa a ser el costo de referencia del producto
    if (unitCost !== null) {
      prod.costPrice = unitCost;
      await prod.save();
    }

    await stock.recordMovement({
      type: 'INGRESO',
      branchId,
      productId,
      quantity,
      lotNumber: hasLot ? lotNumber : null,
      expirationDate: hasLot ? expirationDate : null,
      supplierId: supplierId || null,
      unitCost,
      userId: req.user.id
    });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'REGISTER_STOCK',
      details: `Registró ${quantity} unidades de "${prod.name}"${hasLot ? ` (Lote: ${lotNumber})` : ''} en sucursal "${branch.name}"${supplier ? ` del proveedor "${supplier.name}"` : ''}`
    });

    res.status(201).json(stockEntry || { productId, branchId, quantity, newStock: branchStock.quantity });
  } catch (error) {
    res.status(500).json({ message: 'Error registrando stock', error: error.message });
  }
};

// --- Ingresos Extraordinarios / Extraoficiales (Módulo 2) ---
const INFORMAL_ENTRY_TYPES = ['ENCONTRADO', 'DONACION', 'DEVOLUCION', 'EXCEDENTE', 'SIN_OC'];

const registerInformalEntry = async (req, res) => {
  try {
    const { productId, branchId, entryType, description } = req.body;
    const quantity = parseInt(req.body.quantity, 10);

    const [product, informalBranch] = await Promise.all([
      Product.findById(productId),
      PhysicalSpace.findById(branchId)
    ]);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });
    if (!informalBranch) return res.status(404).json({ message: 'Sucursal no encontrada' });

    const branchStock = await stock.increaseStock(branchId, productId, quantity);

    await stock.recordMovement({
      type: 'INGRESO_EXTRAORDINARIO',
      subtype: entryType,
      branchId,
      productId,
      quantity,
      reason: description,
      userId: req.user.id
    });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'INFORMAL_ENTRY',
      details: `Ingreso extraoficial [${entryType}]: ${quantity} unidades de "${product.name}" en sucursal "${informalBranch.name}". Descripción: ${description}`
    });

    res.status(201).json({
      message: 'Ingreso extraordinario registrado correctamente',
      productName: product.name,
      quantity,
      newStock: branchStock.quantity,
      entryType
    });
  } catch (error) {
    res.status(500).json({ message: 'Error registrando ingreso extraordinario', error: error.message });
  }
};

// --- Egresos y mermas ---
const EXIT_TYPES = ['VENTA', 'CONSUMO', 'ROTURA', 'VENCIDO', 'OTRO'];

const registerExit = async (req, res) => {
  try {
    const { productId, branchId, exitType, description } = req.body;
    const quantity = parseInt(req.body.quantity, 10);

    if (!(await canAccessBranch(req.user, branchId))) {
      return res.status(403).json({ message: 'Solo podés registrar egresos de tu sucursal.' });
    }

    const [product, branch] = await Promise.all([
      Product.findById(productId),
      PhysicalSpace.findById(branchId)
    ]);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });

    const updated = await stock.decreaseAvailableStock(branchId, productId, quantity);
    if (!updated) {
      return res.status(400).json({
        message: `Stock disponible insuficiente de "${product.name}" en "${branch.name}" (las unidades reservadas para pedidos no se pueden dar de baja).`
      });
    }

    const lots = await stock.consumeLots(branchId, productId, quantity);
    const lotText = lots.length ? ` Lotes: ${lots.map(l => `${l.lotNumber} (${l.quantity})`).join(', ')}.` : '';

    await stock.recordMovement({
      type: 'EGRESO',
      subtype: exitType,
      branchId,
      productId,
      quantity: -quantity,
      lotNumber: lots.map(l => l.lotNumber).join(', ') || null,
      reason: description || null,
      userId: req.user.id
    });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'STOCK_EXIT',
      details: `Egreso [${exitType}]: ${quantity} unidades de "${product.name}" en sucursal "${branch.name}".${lotText}${description ? ` Motivo: ${description}` : ''}`
    });

    res.status(201).json({
      message: 'Egreso registrado correctamente',
      productName: product.name,
      quantity,
      newStock: updated.quantity,
      lots
    });
  } catch (error) {
    res.status(500).json({ message: 'Error registrando egreso', error: error.message });
  }
};

// --- Lotes ---
const getLots = async (req, res) => {
  try {
    const filter = { branchId: { $ne: null } };
    if (req.query.branchId) filter.branchId = req.query.branchId;
    if (req.query.productId) filter.productId = req.query.productId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.withStock === 'true') filter.remaining = { $gt: 0 };

    if (req.user.role !== 'Administrador') {
      const ownBranch = await effectiveBranchId(req.user);
      if (!ownBranch) return res.json([]);
      filter.branchId = ownBranch;
    }

    const lots = await StockEntry.find(filter)
      .populate('productId', 'name')
      .populate('branchId', 'name')
      .populate('supplierId', 'name')
      .sort({ expirationDate: 1 })
      .limit(1000)
      .lean();

    res.json(lots.map(l => ({
      id: l._id.toString(),
      lotNumber: l.lotNumber,
      expirationDate: l.expirationDate,
      quantity: l.quantity,
      remaining: l.remaining ?? l.quantity,
      status: l.status,
      unitCost: l.unitCost ?? null,
      productId: toId(l.productId),
      productName: l.productId?.name || null,
      branchId: toId(l.branchId),
      branchName: l.branchId?.name || null,
      supplierName: l.supplierId?.name || null,
      createdAt: l.createdAt
    })));
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo lotes', error: error.message });
  }
};

module.exports = {
  INFORMAL_ENTRY_TYPES,
  EXIT_TYPES,
  createCategory,
  getCategories,
  createProduct,
  getProducts,
  updateProduct,
  registerStockEntry,
  registerInformalEntry,
  registerExit,
  getLots
};
