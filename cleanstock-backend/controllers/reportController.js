const { BranchStock, PhysicalSpace, Order, StockMovement } = require('../models');
const { buildStockAlerts } = require('./alertController');
const { startOfDay } = require('../utils/format');

const ORDER_STATUSES = ['PENDIENTE_VALIDACION', 'PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'RECHAZADO'];

// Unidades del inventario por sucursal
const buildStockByBranch = async () => {
  const [branches, stockItems] = await Promise.all([
    PhysicalSpace.find().sort({ name: 1 }).lean(),
    BranchStock.find().lean()
  ]);

  const byBranch = new Map(branches.map(b => [b._id.toString(), {
    branchId: b._id.toString(),
    branchName: b.name,
    totalUnits: 0,
    products: 0
  }]));

  for (const item of stockItems) {
    const row = byBranch.get(item.branchId.toString());
    if (!row) continue;
    row.totalUnits += item.quantity;
    if (item.quantity > 0) row.products += 1;
  }

  return [...byBranch.values()];
};

/**
 * GET /api/reports/dashboard
 * Datos para los gráficos del panel de administración.
 */
const getDashboard = async (req, res) => {
  try {
    const since = startOfDay();
    since.setDate(since.getDate() - 29);

    const [stockByBranch, alerts, ordersByStatusRaw, movementsRaw] = await Promise.all([
      buildStockByBranch(),
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
      stockByBranch,
      ordersByStatus,
      movementsLast30,
      topShortages
    });
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo datos del dashboard', error: error.message });
  }
};

module.exports = {
  getDashboard
};
