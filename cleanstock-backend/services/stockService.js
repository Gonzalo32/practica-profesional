const { BranchStock, StockEntry, StockMovement } = require('../models');

// Todas las operaciones sobre BranchStock son atómicas: la condición y la
// modificación viajan en una sola consulta a MongoDB, así dos usuarios
// trabajando al mismo tiempo no pueden reservar o retirar más stock del que hay.

const availableAtLeast = (qty) => ({
  $expr: { $gte: [{ $subtract: ['$quantity', { $ifNull: ['$reservedQuantity', 0] }] }, qty] }
});

const subtractReserved = (qty) => ({
  $max: [0, { $subtract: [{ $ifNull: ['$reservedQuantity', 0] }, qty] }]
});

// Suma unidades al stock de una sucursal (crea el registro si no existe).
const increaseStock = async (branchId, productId, qty) => {
  const update = { $inc: { quantity: qty }, $setOnInsert: { reservedQuantity: 0 } };
  const options = { new: true, upsert: true };
  try {
    return await BranchStock.findOneAndUpdate({ branchId, productId }, update, options);
  } catch (error) {
    // Dos altas simultáneas del mismo producto: la segunda choca con el índice único y se reintenta
    if (error.code === 11000) {
      return BranchStock.findOneAndUpdate({ branchId, productId }, update, options);
    }
    throw error;
  }
};

// Resta unidades disponibles (sin tocar lo reservado). Devuelve null si no alcanza.
const decreaseAvailableStock = (branchId, productId, qty) => BranchStock.findOneAndUpdate(
  { branchId, productId, ...availableAtLeast(qty) },
  { $inc: { quantity: -qty } },
  { new: true }
);

// Reserva unidades para un pedido. Devuelve null si no hay disponible suficiente.
const reserveStock = (branchId, productId, qty) => BranchStock.findOneAndUpdate(
  { branchId, productId, ...availableAtLeast(qty) },
  { $inc: { reservedQuantity: qty } },
  { new: true }
);

// Libera una reserva (pedido rechazado o reserva revertida).
const releaseReservation = (branchId, productId, qty) => BranchStock.findOneAndUpdate(
  { branchId, productId },
  [{ $set: { reservedQuantity: subtractReserved(qty) } }],
  { new: true, updatePipeline: true }
);

// Entrega de un pedido: descuenta del origen las unidades reservadas.
// Si el sistema tiene menos stock físico del que se despachó, no lo redondea en
// silencio: deja el stock en 0 y devuelve el faltante para registrarlo como discrepancia.
const consumeReservedStock = async (branchId, productId, qty) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const full = await BranchStock.findOneAndUpdate(
      { branchId, productId, quantity: { $gte: qty } },
      [{ $set: { quantity: { $subtract: ['$quantity', qty] }, reservedQuantity: subtractReserved(qty) } }],
      { new: true, updatePipeline: true }
    );
    if (full) return { removed: qty, missing: 0 };

    const before = await BranchStock.findOneAndUpdate(
      { branchId, productId, quantity: { $lt: qty } },
      [{ $set: { quantity: 0, reservedQuantity: subtractReserved(qty) } }],
      { new: false, updatePipeline: true }
    );
    if (before) return { removed: before.quantity, missing: qty - before.quantity };

    const exists = await BranchStock.exists({ branchId, productId });
    if (!exists) return { removed: 0, missing: qty };
    // El stock cambió entre las dos consultas: se reintenta
  }
  throw new Error('No se pudo descontar el stock por cambios concurrentes. Intentá de nuevo.');
};

// Fija la cantidad exacta (conteo físico). Devuelve la cantidad anterior.
const setStockQuantity = async (branchId, productId, newQty) => {
  const before = await BranchStock.findOneAndUpdate(
    { branchId, productId },
    { $set: { quantity: newQty }, $setOnInsert: { reservedQuantity: 0 } },
    { new: false, upsert: true }
  );
  return before ? before.quantity : 0;
};

// ─── Lotes y vencimientos ────────────────────────────────────────────────────

const createLot = (data) => StockEntry.create({ ...data, remaining: data.quantity });

// Descuenta unidades de los lotes de una sucursal en orden FEFO.
// Devuelve los lotes usados (sirve para trasladarlos a otra sucursal).
// Si parte del stock se cargó sin lote, esas unidades simplemente no figuran.
const consumeLots = async (branchId, productId, qty) => {
  const lots = await StockEntry.find({ branchId, productId, remaining: { $gt: 0 } })
    .sort({ expirationDate: 1, createdAt: 1 })
    .lean();

  let pending = qty;
  const used = [];
  for (const lot of lots) {
    if (pending <= 0) break;
    const take = Math.min(lot.remaining, pending);
    const newRemaining = { $subtract: ['$remaining', take] };
    const updated = await StockEntry.findOneAndUpdate(
      { _id: lot._id, remaining: { $gte: take } },
      [{ $set: { remaining: newRemaining, status: { $cond: [{ $eq: [newRemaining, 0] }, 'AGOTADO', '$status'] } } }],
      { new: true, updatePipeline: true }
    );
    if (!updated) continue;
    pending -= take;
    used.push({
      lotNumber: lot.lotNumber,
      expirationDate: lot.expirationDate,
      quantity: take,
      supplierId: lot.supplierId || null,
      unitCost: lot.unitCost ?? null
    });
  }
  return used;
};

// Marca como VENCIDOS los lotes con stock cuya fecha ya pasó.
const markExpiredLots = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result = await StockEntry.updateMany(
    { status: 'DISPONIBLE', remaining: { $gt: 0 }, expirationDate: { $lt: today } },
    { $set: { status: 'VENCIDO' } }
  );
  return result.modifiedCount || 0;
};

const recordMovement = (data) => StockMovement.create(data);

module.exports = {
  increaseStock,
  decreaseAvailableStock,
  reserveStock,
  releaseReservation,
  consumeReservedStock,
  setStockQuantity,
  createLot,
  consumeLots,
  markExpiredLots,
  recordMovement
};
