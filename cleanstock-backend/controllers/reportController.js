const { BranchStock, PhysicalSpace, Order, StockMovement } = require('../models');
const { buildStockAlerts } = require('./alertController');
const { startOfDay } = require('../utils/format');

const ORDER_STATUSES = ['PENDIENTE_VALIDACION', 'PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'RECHAZADO'];

// Unidades y valor ($) del inventario por sucursal
const buildValuation = async () => {
  const [branches, stockItems] = await Promise.all([
    PhysicalSpace.find().sort({ name: 1 }).lean(),
    BranchStock.find().populate('productId', 'name costPrice').lean()
  ]);

  const byBranch = new Map(branches.map(b => [b._id.toString(), {
    branchId: b._id.toString(),
    branchName: b.name,
    totalUnits: 0,
    totalValue: 0,
    products: 0
  }]));

  for (const item of stockItems) {
    const row = byBranch.get(item.branchId.toString());
    if (!row) continue;
    const cost = item.productId?.costPrice || 0;
    row.totalUnits += item.quantity;
    row.totalValue += item.quantity * cost;
    if (item.quantity > 0) row.products += 1;
  }

  const rows = [...byBranch.values()];
  return {
    branches: rows,
    totalUnits: rows.reduce((acc, r) => acc + r.totalUnits, 0),
    totalValue: rows.reduce((acc, r) => acc + r.totalValue, 0)
  };
};

/**
 * GET /api/reports/valuation
 */
const getValuation = async (req, res) => {
  try {
    res.json(await buildValuation());
  } catch (error) {
    res.status(500).json({ message: 'Error calculando la valorización', error: error.message });
  }
};

/**
 * GET /api/reports/dashboard
 * Datos para los gráficos del panel de administración.
 */
const getDashboard = async (req, res) => {
  try {
    const since = startOfDay();
    since.setDate(since.getDate() - 29);

    const [valuation, alerts, ordersByStatusRaw, movementsRaw] = await Promise.all([
      buildValuation(),
      buildStockAlerts(req.user),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      StockMovement.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '-03:00' } },
            entradas: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, '$quantity', 0] } },
            salidas: { $sum: { $cond: [{ $lt: ['$quantity', 0] }, { $abs: '$quantity' }, 0] } }
          }
        }
      ])
    ]);

    const ordersByStatus = ORDER_STATUSES.map(status => ({
      status,
      count: ordersByStatusRaw.find(o => o._id === status)?.count || 0
    }));

    // Serie diaria completa de los últimos 30 días (los días sin movimientos quedan en 0)
    const movementsMap = new Map(movementsRaw.map(m => [m._id, m]));
    const movementsLast30 = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const m = movementsMap.get(key);
      movementsLast30.push({ date: key, entradas: m?.entradas || 0, salidas: m?.salidas || 0 });
    }

    const topShortages = [...alerts]
      .sort((a, b) => b.deficit - a.deficit || a.currentQuantity - b.currentQuantity)
      .slice(0, 10)
      .map(a => ({
        label: `${a.productName} (${a.branchName})`,
        deficit: a.deficit,
        currentQuantity: a.currentQuantity,
        minimumStock: a.minimumStock
      }));

    res.json({
      stockByBranch: valuation.branches,
      inventoryValue: valuation.totalValue,
      ordersByStatus,
      movementsLast30,
      topShortages
    });
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo datos del dashboard', error: error.message });
  }
};

module.exports = {
  getValuation,
  getDashboard
};
