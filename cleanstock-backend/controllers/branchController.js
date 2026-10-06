const { PhysicalSpace, BranchStock, Product, Category, User, ActivityLog } = require('../models');

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
    if (error.code === 11000 || error.name === 'SequelizeUniqueConstraintError') {
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

    const stockItems = await BranchStock.find({ branchId: id })
      .populate({
        path: 'productId',
        populate: { path: 'categoryId' }
      })
      .lean();

    // Enriquecer con cantidad disponible y mínimo efectivo
    const enrichedItems = stockItems.map(item => {
      const productObj = item.productId && typeof item.productId === 'object' ? item.productId : null;
      const categoryObj = productObj && productObj.categoryId && typeof productObj.categoryId === 'object' ? productObj.categoryId : null;

      const effectiveMin = item.branchMinStock !== null && item.branchMinStock !== undefined
        ? item.branchMinStock
        : (productObj?.minimumStock || 0);
      const reserved = item.reservedQuantity || 0;
      const available = Math.max(0, item.quantity - reserved);

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
        Producto: productObj ? {
          id: productObj._id.toString(),
          _id: productObj._id.toString(),
          name: productObj.name,
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
    const { productId, quantity, reason } = req.body;

    if (!productId || quantity === undefined) {
      return res.status(400).json({ message: 'productId y quantity son obligatorios' });
    }

    const branch = await PhysicalSpace.findById(id);
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    let stockRecord = await BranchStock.findOne({ branchId: id, productId });
    if (!stockRecord) {
      stockRecord = new BranchStock({ branchId: id, productId, quantity: 0, reservedQuantity: 0 });
    }

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

    const stockActions = ['STOCK_ENTRY', 'STOCK_EXIT', 'STOCK_MOVEMENT', 'REGISTER_STOCK'];
    const filter = { action: { $in: stockActions } };

    if (productId) {
      const product = await Product.findById(productId);
      if (product) {
        filter.details = { $regex: product.name, $options: 'i' };
      }
    }

    const logs = await ActivityLog.find(filter)
      .populate('userId', 'username role')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    const formattedLogs = logs.map(l => ({
      id: l._id.toString(),
      _id: l._id.toString(),
      action: l.action,
      details: l.details,
      timestamp: l.timestamp || l.createdAt,
      createdAt: l.createdAt,
      User: l.userId && typeof l.userId === 'object' ? {
        username: l.userId.username,
        role: l.userId.role
      } : null
    }));

    res.json(formattedLogs);
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
