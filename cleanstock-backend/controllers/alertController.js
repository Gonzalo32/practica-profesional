const { BranchStock, Product, Category, PhysicalSpace, ActivityLog, User, Order } = require('../models');
const { Op } = require('sequelize');

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

    const allStock = await BranchStock.findAll({
      where: whereClause,
      include: [
        {
          model: Product,
          as: 'Producto',
          include: [{ model: Category }]
        },
        {
          model: PhysicalSpace,
          as: 'Sucursal',
          attributes: ['id', 'name', 'type']
        }
      ]
    });

    // Filtrar items donde quantity <= mínimo efectivo
    const alerts = allStock
      .filter(item => {
        const effectiveMin = item.branchMinStock !== null
          ? item.branchMinStock
          : (item.Producto?.minimumStock || 0);
        return item.quantity <= effectiveMin;
      })
      .map(item => {
        const effectiveMin = item.branchMinStock !== null
          ? item.branchMinStock
          : (item.Producto?.minimumStock || 0);
        const severity = item.quantity === 0 ? 'CRITICO' : 'BAJO';
        return {
          branchId: item.branchId,
          branchName: item.Sucursal?.name || 'Sin nombre',
          branchType: item.Sucursal?.type || '',
          productId: item.productId,
          productName: item.Producto?.name || 'N/A',
          categoryName: item.Producto?.Category?.name || '—',
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
    // Contar alertas activas (todos los pares por debajo del mínimo)
    const allStock = await BranchStock.findAll({
      include: [{ model: Product, as: 'Producto' }]
    });

    const activeAlerts = allStock.filter(item => {
      const effectiveMin = item.branchMinStock !== null
        ? item.branchMinStock
        : (item.Producto?.minimumStock || 0);
      return item.quantity <= effectiveMin;
    }).length;

    const criticalAlerts = allStock.filter(item => item.quantity === 0).length;

    // Pedidos en tránsito
    const inTransitOrders = await Order.count({
      where: {
        status: { [Op.in]: ['PENDIENTE', 'EN_PREPARACION', 'DESPACHADO'] }
      }
    });

    // Ingresos de stock registrados hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayLogs = await ActivityLog.count({
      where: {
        action: { [Op.in]: ['REGISTER_STOCK', 'STOCK_ENTRY', 'INFORMAL_ENTRY'] },
        createdAt: { [Op.gte]: today }
      }
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

    const [stockRecord] = await BranchStock.findOrCreate({
      where: { branchId, productId },
      defaults: { quantity: 0, reservedQuantity: 0 }
    });

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
