const { Category, Product, StockEntry, ActivityLog, PhysicalSpace, Supplier, Brand } = require('../models');
const { canAccessBranch } = require('../middlewares/authMiddleware');
const { effectiveBranchId } = require('../services/settingsService');
const stock = require('../services/stockService');
const { toId, escapeRegex } = require('../utils/format');

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

const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const category = await Category.findByIdAndUpdate(
      id,
      { $set: { name, description } },
      { returnDocument: 'after', runValidators: true }
    );
    if (!category) return res.status(404).json({ message: 'Categoría no encontrada' });
    res.json({ ...category.toObject(), id: category._id.toString() });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Ya existe una categoría con ese nombre.' });
    }
    res.status(500).json({ message: 'Error actualizando categoría', error: error.message });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const linkedProducts = await Product.countDocuments({ categoryId: id });
    if (linkedProducts > 0) {
      return res.status(400).json({ message: `No se puede eliminar la categoría porque tiene ${linkedProducts} producto(s) vinculado(s).` });
    }
    const deleted = await Category.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Categoría no encontrada' });
    res.json({ message: 'Categoría eliminada con éxito' });
  } catch (error) {
    res.status(500).json({ message: 'Error eliminando categoría', error: error.message });
  }
};

const duplicateProductMessage = (error) => {
  const field = Object.keys(error.keyPattern || {})[0];
  if (field === 'sku') return 'Ya existe un producto con ese código interno.';
  return 'Ya existe un producto con ese nombre y esa marca.';
};

const createProduct = async (req, res) => {
  try {
    const { name, categoryId, description, minimumStock, sku, perishable, requiresApproval, brandId } = req.body;
    if (brandId && !(await Brand.exists({ _id: brandId }))) return res.status(404).json({ message: 'Marca no encontrada' });

    const product = await Product.create({
      name,
      categoryId: categoryId || null,
      brandId: brandId || null,
      description,
      minimumStock,
      sku: sku || null,
      perishable: perishable !== undefined ? perishable : true,
      requiresApproval: !!requiresApproval
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
  perishable: p.perishable !== false,
  requiresApproval: !!p.requiresApproval,
  categoryId: p.categoryId ? toId(p.categoryId) : null,
  brandId: p.brandId ? toId(p.brandId) : null,
  Brand: p.brandId && typeof p.brandId === 'object' ? { id: p.brandId._id.toString(), name: p.brandId.name } : null,
  Category: p.categoryId && typeof p.categoryId === 'object' ? {
    id: p.categoryId._id.toString(),
    name: p.categoryId.name,
    description: p.categoryId.description
  } : null
});

const getProducts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.q) {
      const regex = new RegExp(escapeRegex(req.query.q), 'i');
      filter.$or = [{ name: regex }, { description: regex }, { sku: regex }];
    }

    const products = await Product.find(filter)
      .populate('categoryId')
      .populate('brandId', 'name')
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
    const { name, categoryId, description, minimumStock, sku, perishable, requiresApproval, brandId } = req.body;
    if (brandId && !(await Brand.exists({ _id: brandId }))) return res.status(404).json({ message: 'Marca no encontrada' });

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    if (name) product.name = name;
    if (categoryId !== undefined) product.categoryId = categoryId || null;
    if (brandId !== undefined) product.brandId = brandId || null;
    if (description !== undefined) product.description = description;
    if (minimumStock !== undefined) product.minimumStock = minimumStock;
    if (sku !== undefined) product.sku = sku || null;
    if (perishable !== undefined) product.perishable = perishable;
    if (requiresApproval !== undefined) product.requiresApproval = !!requiresApproval;

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

const registerStockEntry = async (req, res) => {
  try {
    const { productId, lotNumber, expirationDate, branchId, supplierId, brandId } = req.body;
    const quantity = parseInt(req.body.quantity, 10);

    const [prod, branch, supplier, brand] = await Promise.all([
      Product.findById(productId),
      PhysicalSpace.findById(branchId),
      supplierId ? Supplier.findById(supplierId) : null,
      brandId ? Brand.findById(brandId).lean() : null
    ]);
    if (!prod) return res.status(404).json({ message: 'Producto no encontrado' });
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });
    if (supplierId && !supplier) return res.status(404).json({ message: 'Proveedor no encontrado' });
    if (brandId && !brand) return res.status(404).json({ message: 'Marca no encontrada' });

    if (prod.perishable !== false && !(lotNumber && expirationDate)) {
      return res.status(400).json({ message: `"${prod.name}" tiene vencimiento: indicá el número de lote y la fecha de vencimiento.` });
    }
    const hasLot = !!lotNumber;
    const effectiveExp = prod.perishable !== false ? expirationDate : (expirationDate || null);

    const stockEntry = hasLot
      ? await stock.createLot({
        productId,
        branchId,
        lotNumber,
        expirationDate: effectiveExp,
        quantity,
        supplierId: supplierId || null,
        brandId: brandId || null,
        registeredBy: req.user.id
      })
      : null;

    const branchStock = await stock.increaseStock(branchId, productId, quantity);

    await stock.recordMovement({
      type: 'INGRESO',
      branchId,
      productId,
      quantity,
      lotNumber: hasLot ? lotNumber : null,
      expirationDate: hasLot ? effectiveExp : null,
      supplierId: supplierId || null,
      brandId: brandId || null,
      stockEntryId: stockEntry?._id || null,
      userId: req.user.id
    });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'REGISTER_STOCK',
      details: `Registró ${quantity} unidades de "${prod.name}"${brand ? ` marca ${brand.name}` : ''}${hasLot ? ` (Lote: ${lotNumber})` : ''} en sucursal "${branch.name}"${supplier ? ` del proveedor "${supplier.name}"` : ''}`
    });

    res.status(201).json(stockEntry || { productId, branchId, quantity, newStock: branchStock.quantity });
  } catch (error) {
    res.status(500).json({ message: 'Error registrando stock', error: error.message });
  }
};

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

const getLots = async (req, res) => {
  try {
    const filter = { branchId: { $ne: null } };
    if (req.query.branchId) filter.branchId = req.query.branchId;
    if (req.query.productId) filter.productId = req.query.productId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.withStock === 'true') filter.remaining = { $gt: 0 };

    if (!['Administrador', 'Despachante'].includes(req.user.role)) {
      const ownBranch = await effectiveBranchId(req.user);
      if (!ownBranch) return res.json([]);
      filter.branchId = ownBranch;
    }

    const lots = await StockEntry.find(filter)
      .populate('productId', 'name')
      .populate('branchId', 'name')
      .populate('supplierId', 'name')
      .populate('brandId', 'name')
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
      productId: toId(l.productId),
      productName: l.productId?.name || null,
      branchId: toId(l.branchId),
      branchName: l.branchId?.name || null,
      supplierName: l.supplierId?.name || null,
      brandId: toId(l.brandId),
      brandName: l.brandId?.name || null,
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
  updateCategory,
  deleteCategory,
  createProduct,
  getProducts,
  updateProduct,
  registerStockEntry,
  registerInformalEntry,
  registerExit,
  getLots
};
