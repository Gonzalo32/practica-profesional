const { BranchStock, Product, Category, PhysicalSpace, ActivityLog, User, Order } = require('../models');

// ─── Módulo 1: Sistema de Alertas de Stock Bajo ───────────────────────────────

/**
 * GET /api/alerts
 * Retorna todos los pares (sucursal, producto) donde el stock actual
 * está por debajo del mínimo definido (por sucursal o global del producto).
 * Admin ve todo. Otros roles solo ven su propia sucursal.
 */
const getStockAlerts = async (req, res) => {
  try {
    const user = req.user;

    const whereClause = {};
    if (user.role !== 'Administrador') {
      if (!user.branchId) {
        return res.json([]); // Sin sucursal asignada → sin alertas
      }
      whereClause.branchId = user.branchId;
    }

    const allStock = await BranchStock.find(whereClause)
      .populate({
        path: 'productId',
        populate: { path: 'categoryId' }
      })
      .populate('branchId', 'name type')
      .lean();

    // Filtrar items donde quantity <= mínimo efectivo
    const alerts = allStock
      .filter(item => {
        const prod = item.productId && typeof item.productId === 'object' ? item.productId : null;
        const effectiveMin = item.branchMinStock !== null && item.branchMinStock !== undefined
          ? item.branchMinStock
          : (prod?.minimumStock || 0);
        return item.quantity <= effectiveMin;
      })
      .map(item => {
        const prod = item.productId && typeof item.productId === 'object' ? item.productId : null;
        const branch = item.branchId && typeof item.branchId === 'object' ? item.branchId : null;
        const category = prod && prod.categoryId && typeof prod.categoryId === 'object' ? prod.categoryId : null;

        const effectiveMin = item.branchMinStock !== null && item.branchMinStock !== undefined
          ? item.branchMinStock
          : (prod?.minimumStock || 0);
        const severity = item.quantity === 0 ? 'CRITICO' : 'BAJO';

        return {
          branchId: branch ? branch._id.toString() : (item.branchId ? item.branchId.toString() : 'N/A'),
          branchName: branch?.name || 'Sin nombre',
          branchType: branch?.type || '',
          productId: prod ? prod._id.toString() : (item.productId ? item.productId.toString() : 'N/A'),
          productName: prod?.name || 'N/A',
          categoryName: category?.name || '—',
          currentQuantity: item.quantity,
          reservedQuantity: item.reservedQuantity || 0,
          availableQuantity: item.quantity - (item.reservedQuantity || 0),
          minimumStock: effectiveMin,
          severity
        };
      })
      .sort((a, b) => a.currentQuantity - b.currentQuantity); // Más críticos primero

    res.json(alerts);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo alertas de stock', error: error.message });
  }
};

/**
 * GET /api/alerts/kpis
 * KPIs del dashboard (solo Admin)
 */
const getKPIs = async (req, res) => {
  try {
    const allStock = await BranchStock.find()
      .populate('productId')
      .lean();

    const activeAlerts = allStock.filter(item => {
      const prod = item.productId && typeof item.productId === 'object' ? item.productId : null;
      const effectiveMin = item.branchMinStock !== null && item.branchMinStock !== undefined
        ? item.branchMinStock
        : (prod?.minimumStock || 0);
      return item.quantity <= effectiveMin;
    }).length;

    const criticalAlerts = allStock.filter(item => item.quantity === 0).length;

    // Pedidos en tránsito
    const inTransitOrders = await Order.countDocuments({
      status: { $in: ['PENDIENTE', 'EN_PREPARACION', 'DESPACHADO'] }
    });

    // Ingresos de stock registrados hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayLogs = await ActivityLog.countDocuments({
      action: { $in: ['REGISTER_STOCK', 'STOCK_ENTRY', 'INFORMAL_ENTRY'] },
      createdAt: { $gte: today }
    });

    res.json({
      activeAlerts,
      criticalAlerts,
      inTransitOrders,
      todayStockEntries: todayLogs
    });
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo KPIs', error: error.message });
  }
};

/**
 * PUT /api/alerts/branch-min-stock
 * Configura el stock mínimo específico de una sucursal para un producto
 */
const setBranchMinStock = async (req, res) => {
  try {
    const { branchId, productId, branchMinStock } = req.body;

    if (!branchId || !productId) {
      return res.status(400).json({ message: 'branchId y productId son obligatorios' });
    }

    let stockRecord = await BranchStock.findOne({ branchId, productId });
    if (!stockRecord) {
      stockRecord = new BranchStock({ branchId, productId, quantity: 0, reservedQuantity: 0 });
    }

    stockRecord.branchMinStock = branchMinStock !== undefined ? branchMinStock : null;
    await stockRecord.save();

    await ActivityLog.create({
      userId: req.user.id,
      action: 'SET_MIN_STOCK',
      details: `Stock mínimo para producto ${productId} en sucursal ${branchId} configurado a ${branchMinStock}`
    });

    res.json({ message: 'Stock mínimo actualizado', stockRecord });
  } catch (error) {
    res.status(500).json({ message: 'Error configurando stock mínimo', error: error.message });
  }
};

module.exports = {
  getStockAlerts,
  getKPIs,
  setBranchMinStock
};
