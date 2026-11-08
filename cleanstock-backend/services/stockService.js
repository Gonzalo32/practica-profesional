const { BranchStock, StockEntry, StockMovement } = require('../models');
const { todayAsUTCDate } = require('../utils/format');

const availableAtLeast = (qty) => ({
  $expr: { $gte: [{ $subtract: ['$quantity', { $ifNull: ['$reservedQuantity', 0] }] }, qty] }
});

const subtractReserved = (qty) => ({
  $max: [0, { $subtract: [{ $ifNull: ['$reservedQuantity', 0] }, qty] }]
});

const increaseStock = async (branchId, productId, qty) => {
  const update = { $inc: { quantity: qty }, $setOnInsert: { reservedQuantity: 0 } };
  const options = { returnDocument: 'after', upsert: true };
  try {
    return await BranchStock.findOneAndUpdate({ branchId, productId }, update, options);
  } catch (error) {
    if (error.code === 11000) {
      return BranchStock.findOneAndUpdate({ branchId, productId }, update, options);
    }
    throw error;
  }
};

const decreaseAvailableStock = (branchId, productId, qty) => BranchStock.findOneAndUpdate(
  { branchId, productId, ...availableAtLeast(qty) },
  { $inc: { quantity: -qty } },
  { returnDocument: 'after' }
);

const reserveStock = (branchId, productId, qty) => BranchStock.findOneAndUpdate(
  { branchId, productId, ...availableAtLeast(qty) },
  { $inc: { reservedQuantity: qty } },
  { returnDocument: 'after' }
);

const releaseReservation = (branchId, productId, qty) => BranchStock.findOneAndUpdate(
  { branchId, productId },
  [{ $set: { reservedQuantity: subtractReserved(qty) } }],
  { returnDocument: 'after', updatePipeline: true }
);

const consumeReservedStock = async (branchId, productId, qty) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const full = await BranchStock.findOneAndUpdate(
      { branchId, productId, quantity: { $gte: qty } },
      [{ $set: { quantity: { $subtract: ['$quantity', qty] }, reservedQuantity: subtractReserved(qty) } }],
      { returnDocument: 'after', updatePipeline: true }
    );
    if (full) return { removed: qty, missing: 0 };

    const before = await BranchStock.findOneAndUpdate(
      { branchId, productId, quantity: { $lt: qty } },
      [{ $set: { quantity: 0, reservedQuantity: subtractReserved(qty) } }],
      { returnDocument: 'before', updatePipeline: true }
    );
    if (before) return { removed: before.quantity, missing: qty - before.quantity };

    const exists = await BranchStock.exists({ branchId, productId });
    if (!exists) return { removed: 0, missing: qty };
  }
  throw new Error('No se pudo descontar el stock por cambios concurrentes. Intentá de nuevo.');
};

const setStockQuantity = async (branchId, productId, newQty) => {
  const before = await BranchStock.findOneAndUpdate(
    { branchId, productId },
    { $set: { quantity: newQty }, $setOnInsert: { reservedQuantity: 0 } },
    { returnDocument: 'before', upsert: true }
  );
  return before ? before.quantity : 0;
};

const createLot = (data) => StockEntry.create({ ...data, remaining: data.quantity });

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
      { returnDocument: 'after', updatePipeline: true }
    );
    if (!updated) continue;
    pending -= take;
  used.push({
      lotNumber: lot.lotNumber,
      expirationDate: lot.expirationDate,
      quantity: take,
      supplierId: lot.supplierId || null,
      brandId: lot.brandId || null
    });
  }
  return used;
};

const consumePreparedVariants = async (branchId, productId, preparedVariants, totalQty) => {
  if (!Array.isArray(preparedVariants) || !preparedVariants.length) {
    return consumeLots(branchId, productId, totalQty);
  }
  const used = [];
  let generalNeeded = 0;

  for (const v of preparedVariants) {
    const qty = Number(v.quantity) || 0;
    if (qty <= 0) continue;
    if (v.lotId) {
      const lot = await StockEntry.findOne({ _id: v.lotId, branchId, productId }).lean();
      if (lot && (lot.remaining || 0) > 0) {
        const take = Math.min(lot.remaining, qty);
        const newRemaining = { $subtract: ['$remaining', take] };
        const updated = await StockEntry.findOneAndUpdate(
          { _id: lot._id, remaining: { $gte: take } },
          [{ $set: { remaining: newRemaining, status: { $cond: [{ $eq: [newRemaining, 0] }, 'AGOTADO', '$status'] } } }],
          { returnDocument: 'after', updatePipeline: true }
        );
        if (updated) {
          used.push({
            lotNumber: lot.lotNumber,
            expirationDate: lot.expirationDate,
            quantity: take,
            supplierId: lot.supplierId || null,
            brandId: lot.brandId || null
          });
          if (take < qty) generalNeeded += (qty - take);
          continue;
        }
      }
      generalNeeded += qty;
    }
  }

  if (generalNeeded > 0) {
    const fefoUsed = await consumeLots(branchId, productId, generalNeeded);
    used.push(...fefoUsed);
  }
  return used;
};

const markExpiredLots = async () => {
  const result = await StockEntry.updateMany(
    { status: 'DISPONIBLE', remaining: { $gt: 0 }, expirationDate: { $ne: null, $lt: todayAsUTCDate() } },
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
  consumePreparedVariants,
  markExpiredLots,
  recordMovement
};
