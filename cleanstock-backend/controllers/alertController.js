const { BranchStock, Product, PhysicalSpace, ActivityLog, Order, StockEntry } = require('../models');
const { toId, startOfDay, todayAsUTCDate, daysUntil } = require('../utils/format');
const { effectiveBranchId } = require('../services/settingsService');

// ─── Módulo 1: Sistema de Alertas de Stock Bajo ───────────────────────────────

const effectiveMinFor = (item, prod) => (
  item.branchMinStock !== null && item.branchMinStock !== undefined
    ? item.branchMinStock
    : (prod?.minimumStock || 0)
);

const branchScope = async (user) => {
  if (user.role === 'Administrador') return {};
  const ownBranch = await effectiveBranchId(user);
  return ownBranch ? { branchId: ownBranch } : null;
};

const buildStockAlerts = async (user) => {
  const scope = await branchScope(user);
  if (!scope) return [];

  const allStock = await BranchStock.find(scope)
    .populate({
      path: 'productId',
      populate: { path: 'categoryId' }
    })
    .populate('branchId', 'name type')
    .lean();

  return allStock
    .filter(item => {
      const prod = item.productId && typeof item.productId === 'object' ? item.productId : null;
      return prod && item.quantity <= effectiveMinFor(item, prod);
    })
    .map(item => {
      const prod = item.productId;
      const branch = item.branchId && typeof item.branchId === 'object' ? item.branchId : null;
      const category = prod.categoryId && typeof prod.categoryId === 'object' ? prod.categoryId : null;
      const effectiveMin = effectiveMinFor(item, prod);

      return {
        branchId: branch ? branch._id.toString() : toId(item.branchId),
        branchName: branch?.name || 'Sin nombre',
        branchType: branch?.type || '',
        productId: prod._id.toString(),
        productName: prod.name,
        categoryName: category?.name || '—',
        currentQuantity: item.quantity,
        reservedQuantity: item.reservedQuantity || 0,
        availableQuantity: Math.max(0, item.quantity - (item.reservedQuantity || 0)),
        minimumStock: effectiveMin,
        deficit: Math.max(0, effectiveMin - item.quantity),
        severity: item.quantity === 0 ? 'CRITICO' : 'BAJO'
      };
    })
    .sort((a, b) => a.currentQuantity - b.currentQuantity); // Más críticos primero
};

/**
 * GET /api/alerts
 * Pares (sucursal, producto) con stock por debajo del mínimo.
 * Admin ve todo. Otros roles solo ven su propia sucursal.
 */
const getStockAlerts = async (req, res) => {
  try {
    res.json(await buildStockAlerts(req.user));
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo alertas de stock', error: error.message });
  }
};

/**
 * Lotes con stock que vencen dentro de `days` días (o ya vencidos).
 */
const buildExpirationAlerts = async (user, days = 30) => {
  const scope = await branchScope(user);
  if (!scope) return [];

  const limitDate = todayAsUTCDate();
  limitDate.setUTCDate(limitDate.getUTCDate() + days + 1);

  const lots = await StockEntry.find({
    ...scope,
    branchId: scope.branchId || { $ne: null },
    remaining: { $gt: 0 },
    status: { $ne: 'AGOTADO' },
    expirationDate: { $lt: limitDate }
  })
    .populate('productId', 'name')
    .populate('branchId', 'name')
    .sort({ expirationDate: 1 })
    .lean();

  return lots.map(l => {
    const daysLeft = daysUntil(l.expirationDate);
    return {
      id: l._id.toString(),
      lotNumber: l.lotNumber,
      expirationDate: l.expirationDate,
      daysLeft,
      remaining: l.remaining,
      productId: toId(l.productId),
      productName: l.productId?.name || '—',
      branchId: toId(l.branchId),
      branchName: l.branchId?.name || '—',
      severity: daysLeft < 0 ? 'VENCIDO' : daysLeft <= 7 ? 'URGENTE' : 'POR_VENCER'
    };
  });
};

/**
 * GET /api/alerts/expirations?days=30
 */
const getExpirationAlerts = async (req, res) => {
  try {
    const days = Math.min(365, Math.max(0, parseInt(req.query.days, 10) || 30));
    res.json(await buildExpirationAlerts(req.user, days));
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo vencimientos', error: error.message });
  }
};

/**
 * GET /api/alerts/summary
 * Resumen para la campanita de notificaciones del encabezado.
 */
const getAlertSummary = async (req, res) => {
  try {
    const user = req.user;
    const canSeeStock = ['Administrador', 'Usuario Responsable', 'Despachante'].includes(user.role);

    const [stockAlerts, expirations] = canSeeStock
      ? await Promise.all([buildStockAlerts(user), buildExpirationAlerts(user, 30)])
      : [[], []];

    let pendingApprovals = 0;
    if (user.role === 'Administrador') {
      pendingApprovals = await Order.countDocuments({ status: 'PENDIENTE_VALIDACION' });
    }

    // Pedidos despachados que el usuario tiene que confirmar como recibidos
    let toReceive = 0;
    if (user.role === 'Solicitante') {
      toReceive = await Order.countDocuments({ status: 'DESPACHADO', solicitanteId: user.id });
    } else if (user.role === 'Usuario Responsable' && await effectiveBranchId(user)) {
      toReceive = await Order.countDocuments({ status: 'DESPACHADO', toBranchId: await effectiveBranchId(user) });
    } else if (user.role === 'Administrador') {
      toReceive = await Order.countDocuments({ status: 'DESPACHADO' });
    }

    let toDispatch = 0;
    if (user.role === 'Despachante') {
      toDispatch = await Order.countDocuments({ status: { $in: ['PENDIENTE', 'EN_PREPARACION'] } });
    }

    const items = [];
    stockAlerts.slice(0, 5).forEach(a => items.push({
      kind: 'stock',
      severity: a.severity === 'CRITICO' ? 'danger' : 'warning',
      title: a.severity === 'CRITICO' ? 'Sin stock' : 'Stock bajo',
      text: `${a.productName} en ${a.branchName}: ${a.currentQuantity} u. (mínimo ${a.minimumStock})`
    }));
    expirations.slice(0, 5).forEach(e => items.push({
      kind: 'expiration',
      severity: e.severity === 'POR_VENCER' ? 'warning' : 'danger',
      title: e.daysLeft < 0 ? 'Lote vencido' : `Vence en ${e.daysLeft} día${e.daysLeft === 1 ? '' : 's'}`,
      text: `${e.productName} (lote ${e.lotNumber}) en ${e.branchName}: ${e.remaining} u.`
    }));
    if (pendingApprovals) items.unshift({ kind: 'approval', severity: 'info', title: 'Pedidos para aprobar', text: `${pendingApprovals} pedido(s) esperan validación` });
    if (toReceive) items.unshift({ kind: 'receive', severity: 'info', title: 'Pedidos en camino', text: `${toReceive} pedido(s) despachados para confirmar recepción` });
    if (toDispatch) items.unshift({ kind: 'dispatch', severity: 'info', title: 'Pedidos para despachar', text: `${toDispatch} pedido(s) pendientes o en preparación` });

    res.json({
      lowStock: stockAlerts.length,
      critical: stockAlerts.filter(a => a.severity === 'CRITICO').length,
      expiring: expirations.filter(e => e.daysLeft >= 0).length,
      expired: expirations.filter(e => e.daysLeft < 0).length,
      pendingApprovals,
      toReceive,
      toDispatch,
      total: stockAlerts.length + expirations.length + pendingApprovals + toReceive + toDispatch,
      items
    });
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo resumen de alertas', error: error.message });
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
      return prod && item.quantity <= effectiveMinFor(item, prod);
    }).length;

    const criticalAlerts = allStock.filter(item => item.quantity === 0).length;

    const [inTransitOrders, totalOrders, todayStockEntries, expirations] = await Promise.all([
      Order.countDocuments({ status: { $in: ['PENDIENTE', 'EN_PREPARACION', 'DESPACHADO'] } }),
      Order.countDocuments(),
      ActivityLog.countDocuments({
        action: { $in: ['REGISTER_STOCK', 'STOCK_ENTRY', 'INFORMAL_ENTRY'] },
        createdAt: { $gte: startOfDay() }
      }),
      buildExpirationAlerts(req.user, 30)
    ]);

    res.json({
      activeAlerts,
      criticalAlerts,
      inTransitOrders,
      totalOrders,
      todayStockEntries,
      expiringLots: expirations.filter(e => e.daysLeft >= 0).length,
      expiredLots: expirations.filter(e => e.daysLeft < 0).length
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

    const [product, branch] = await Promise.all([
      Product.findById(productId),
      PhysicalSpace.findById(branchId)
    ]);
    if (!product || !branch) {
      return res.status(404).json({ message: 'Producto o sucursal no encontrados' });
    }

    const value = branchMinStock !== undefined && branchMinStock !== null && branchMinStock !== '' ? Number(branchMinStock) : null;
    const stockRecord = await BranchStock.findOneAndUpdate(
      { branchId, productId },
      { $set: { branchMinStock: value }, $setOnInsert: { quantity: 0, reservedQuantity: 0 } },
      { returnDocument: 'after', upsert: true }
    );

    await ActivityLog.create({
      userId: req.user.id,
      action: 'SET_MIN_STOCK',
      details: `Stock mínimo de "${product.name}" en sucursal "${branch.name}" configurado a ${value === null ? 'el mínimo general del producto' : value}`
    });

    res.json({ message: 'Stock mínimo actualizado', stockRecord });
  } catch (error) {
    res.status(500).json({ message: 'Error configurando stock mínimo', error: error.message });
  }
};

module.exports = {
  buildStockAlerts,
  getStockAlerts,
  getExpirationAlerts,
  getAlertSummary,
  getKPIs,
  setBranchMinStock
};
