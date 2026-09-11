const { PhysicalSpace, BranchStock, Product, Category, User, ActivityLog } = require('../models');

// Obtener todas las sucursales
const getBranches = async (req, res) => {
  try {
    const branches = await PhysicalSpace.findAll({
      order: [['name', 'ASC']]
    });
    res.json(branches);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo sucursales', error: error.message });
  }
};

// Crear una nueva sucursal
const createBranch = async (req, res) => {
  try {
    const { name, description, address, type } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'El nombre de la sucursal es obligatorio' });
    }

    const branch = await PhysicalSpace.create({
      name,
      description: description || null,
      address: address || null,
      type: type || 'sucursal'
    });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'CREATE_BRANCH',
      details: `Administrador creó la sucursal "${name}"`
    });

    res.status(201).json(branch);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: 'Ya existe una sucursal con ese nombre.' });
    }
    res.status(500).json({ message: 'Error creando sucursal', error: error.message });
  }
};

// Eliminar una sucursal
const deleteBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const branch = await PhysicalSpace.findByPk(id);

    if (!branch) {
      return res.status(404).json({ message: 'Sucursal no encontrada' });
    }

    // Desasociar usuarios antes de eliminar
    await User.update({ physicalSpaceId: null }, { where: { physicalSpaceId: id } });

    // Eliminar stock asociado
    await BranchStock.destroy({ where: { branchId: id } });

    const branchName = branch.name;
    await branch.destroy();

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

    const branch = await PhysicalSpace.findByPk(id);
    if (!branch) {
      return res.status(404).json({ message: 'Sucursal no encontrada' });
    }

    if (name) {
      const nameExists = await PhysicalSpace.findOne({ where: { name } });
      if (nameExists && nameExists.id !== id) {
        return res.status(400).json({ message: 'Ya existe otra sucursal con ese nombre' });
      }
      branch.name = name;
    }

    if (description !== undefined) branch.description = description;
    if (address !== undefined) branch.address = address;
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

    const branch = await PhysicalSpace.findByPk(id);
    if (!branch) {
      return res.status(404).json({ message: 'Sucursal no encontrada' });
    }

    const stockItems = await BranchStock.findAll({
      where: { branchId: id },
      include: [
        {
          model: Product,
          as: 'Producto',
          include: [{ model: Category }]
        }
      ],
      order: [[{ model: Product, as: 'Producto' }, 'name', 'ASC']]
    });

    // Enriquecer con cantidad disponible y mínimo efectivo
    const enrichedItems = stockItems.map(item => {
      const effectiveMin = item.branchMinStock !== null
        ? item.branchMinStock
        : (item.Producto?.minimumStock || 0);
      const reserved = item.reservedQuantity || 0;
      const available = Math.max(0, item.quantity - reserved);
      return {
        ...item.toJSON(),
        availableQuantity: available,
        effectiveMinStock: effectiveMin,
        isLow: item.quantity <= effectiveMin && effectiveMin > 0,
        isCritical: item.quantity === 0
      };
    });

    res.json({ branch, stockItems: enrichedItems });
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo stock de sucursal', error: error.message });
  }
};

// Ajustar stock manualmente en una sucursal (ingreso/egreso manual)
const adjustBranchStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { productId, quantity, reason } = req.body;

    if (!productId || quantity === undefined) {
      return res.status(400).json({ message: 'productId y quantity son obligatorios' });
    }

    const branch = await PhysicalSpace.findByPk(id);
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });

    const product = await Product.findByPk(productId);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    // Buscar o crear el registro de stock para (sucursal, producto)
    let [stockRecord, created] = await BranchStock.findOrCreate({
      where: { branchId: id, productId },
      defaults: { quantity: 0, reservedQuantity: 0 }
    });

    const newQuantity = stockRecord.quantity + parseInt(quantity);
    if (newQuantity < 0) {
      return res.status(400).json({
        message: `Stock insuficiente. Stock actual: ${stockRecord.quantity}, ajuste solicitado: ${quantity}`
      });
    }

    stockRecord.quantity = newQuantity;
    await stockRecord.save();

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

// Trazabilidad: obtener movimientos de stock (de ActivityLog)
const getStockMovements = async (req, res) => {
  try {
    const { branchId, productId, limit = 100 } = req.query;

    // Filtrar logs relevantes a movimientos de stock
    const stockActions = ['STOCK_ENTRY', 'STOCK_EXIT', 'STOCK_MOVEMENT', 'REGISTER_STOCK'];

    const { Op } = require('sequelize');
    const { User: UserModel } = require('../models');

    let whereClause = {
      action: { [Op.in]: stockActions }
    };

    // Si se filtra por producto, buscar en el campo details
    if (productId) {
      const product = await Product.findByPk(productId);
      if (product) {
        whereClause.details = { [Op.like]: `%"${product.name}"%` };
      }
    }

    const logs = await ActivityLog.findAll({
      where: whereClause,
      include: [{ model: UserModel, attributes: ['username', 'role'] }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit)
    });

    res.json(logs);
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

