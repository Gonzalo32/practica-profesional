const { Category, Product, StockEntry, ActivityLog, BranchStock } = require('../models');

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
const createProduct = async (req, res) => {
  try {
    const { name, categoryId, description, minimumStock } = req.body;

    const product = await Product.create({
      name,
      categoryId: categoryId || null,
      description,
      minimumStock
    });

    res.status(201).json(product);
  } catch (error) {
    if (error.code === 11000 || error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'Ya existe un producto con ese nombre estandarizado.' });
    }
    res.status(500).json({ message: 'Error creando producto', error: error.message });
  }
};

const getProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .populate('categoryId')
      .lean();

    const formatted = products.map(p => ({
      id: p._id.toString(),
      _id: p._id.toString(),
      name: p.name,
      description: p.description,
      minimumStock: p.minimumStock,
      categoryId: p.categoryId ? (p.categoryId._id ? p.categoryId._id.toString() : p.categoryId) : null,
      Category: p.categoryId && typeof p.categoryId === 'object' ? {
        id: p.categoryId._id.toString(),
        name: p.categoryId.name,
        description: p.categoryId.description
      } : null
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo productos' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, categoryId, description, minimumStock } = req.body;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    if (name) product.name = name;
    if (categoryId !== undefined) product.categoryId = categoryId || null;
    if (description !== undefined) product.description = description;
    if (minimumStock !== undefined) product.minimumStock = minimumStock;

    await product.save();
    res.json(product);
  } catch (error) {
    if (error.code === 11000 || error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'Ya existe un producto con ese nombre.' });
    }
    res.status(500).json({ message: 'Error actualizando producto', error: error.message });
  }
};

// --- Ingresos de Stock (T3.2) ---
const registerStockEntry = async (req, res) => {
  try {
    const { productId, lotNumber, expirationDate, quantity, branchId } = req.body;

    if (!productId || !lotNumber || !expirationDate || !quantity) {
      return res.status(400).json({ message: 'Faltan campos obligatorios para el ingreso de stock' });
    }

    const stockEntry = await StockEntry.create({
      productId,
      lotNumber,
      expirationDate,
      quantity,
      registeredBy: req.user.id
    });

    if (branchId) {
      let branchStock = await BranchStock.findOne({ branchId, productId });
      if (!branchStock) {
        branchStock = new BranchStock({ branchId, productId, quantity: 0, reservedQuantity: 0 });
      }
      branchStock.quantity += parseInt(quantity);
      await branchStock.save();
    }

    await ActivityLog.create({
      userId: req.user.id,
      action: 'REGISTER_STOCK',
      details: `Registró ${quantity} unidades del producto ID ${productId} (Lote: ${lotNumber})${branchId ? ` en sucursal ${branchId}` : ''}`
    });

    res.status(201).json(stockEntry);
  } catch (error) {
    res.status(500).json({ message: 'Error registrando stock', error: error.message });
  }
};

// --- Ingresos Extraordinarios / Extraoficiales (Módulo 2) ---
const INFORMAL_ENTRY_TYPES = ['ENCONTRADO', 'DONACION', 'DEVOLUCION', 'EXCEDENTE', 'SIN_OC'];

const registerInformalEntry = async (req, res) => {
  try {
    const { productId, quantity, branchId, entryType, description } = req.body;

    if (!productId || !quantity || !branchId || !entryType || !description) {
      return res.status(400).json({
        message: 'Campos obligatorios: productId, quantity, branchId, entryType, description'
      });
    }

    if (!INFORMAL_ENTRY_TYPES.includes(entryType)) {
      return res.status(400).json({
        message: `Tipo de ingreso inválido. Usar uno de: ${INFORMAL_ENTRY_TYPES.join(', ')}`
      });
    }

    if (parseInt(quantity) <= 0) {
      return res.status(400).json({ message: 'La cantidad debe ser mayor a 0' });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    let branchStock = await BranchStock.findOne({ branchId, productId });
    if (!branchStock) {
      branchStock = new BranchStock({ branchId, productId, quantity: 0, reservedQuantity: 0 });
    }
    branchStock.quantity += parseInt(quantity);
    await branchStock.save();

    await ActivityLog.create({
      userId: req.user.id,
      action: 'INFORMAL_ENTRY',
      details: `Ingreso extraoficial [${entryType}]: ${quantity} unidades de "${product.name}" en sucursal ${branchId}. Descripción: ${description}`
    });

    res.status(201).json({
      message: 'Ingreso extraordinario registrado correctamente',
      productName: product.name,
      quantity: parseInt(quantity),
      newStock: branchStock.quantity,
      entryType
    });
  } catch (error) {
    res.status(500).json({ message: 'Error registrando ingreso extraordinario', error: error.message });
  }
};

module.exports = {
  createCategory,
  getCategories,
  createProduct,
  getProducts,
  updateProduct,
  registerStockEntry,
  registerInformalEntry
};
