const { Category, Product, StockEntry, ActivityLog } = require('../models');

// --- Categorías ---
const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const category = await Category.create({ name, description });
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: 'Error creando categoría', error: error.message });
  }
};

const getCategories = async (req, res) => {
  try {
    const categories = await Category.findAll();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo categorías' });
  }
};

// --- Productos ---
const createProduct = async (req, res) => {
  try {
    const { name, categoryId, description, minimumStock } = req.body;
    
    // T3.3 Estandarizar nombre - El modelo Product ya tiene un 'setter' que hace toUpperCase y trim.
    // Además, el unique constraint evitará duplicados exactos.
    const product = await Product.create({
      name,
      categoryId,
      description,
      minimumStock
    });
    
    res.status(201).json(product);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'Ya existe un producto con ese nombre estandarizado.' });
    }
    res.status(500).json({ message: 'Error creando producto', error: error.message });
  }
};

const getProducts = async (req, res) => {
  try {
    const products = await Product.findAll({ include: [Category] });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo productos' });
  }
};

// --- Ingresos de Stock (T3.2) ---
const registerStockEntry = async (req, res) => {
  try {
    // Validar atributos críticos
    const { productId, lotNumber, expirationDate, quantity } = req.body;
    
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

    await ActivityLog.create({
      userId: req.user.id,
      action: 'REGISTER_STOCK',
      details: `Registró ${quantity} unidades del producto ID ${productId} (Lote: ${lotNumber})`
    });

    res.status(201).json(stockEntry);
  } catch (error) {
    res.status(500).json({ message: 'Error registrando stock', error: error.message });
  }
};

module.exports = {
  createCategory,
  getCategories,
  createProduct,
  getProducts,
  registerStockEntry
};
