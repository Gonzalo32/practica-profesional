const { mongoose } = require('../config/database');

const MOVEMENT_TYPES = [
  'INGRESO',
  'INGRESO_EXTRAORDINARIO',
  'EGRESO',
  'AJUSTE',
  'TRANSFERENCIA_SALIDA',
  'TRANSFERENCIA_ENTRADA',
  'CONTEO',
  'DISCREPANCIA'
];

const stockMovementSchema = new mongoose.Schema({
  type: { type: String, enum: MOVEMENT_TYPES, required: true },
  subtype: { type: String, default: null },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhysicalSpace', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true },
  lotNumber: { type: String, default: null },
  expirationDate: { type: Date, default: null },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
  countId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryCount', default: null },
  reason: { type: String, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  stockEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockEntry', default: null },
  editedAt: { type: Date, default: null },
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

stockMovementSchema.index({ branchId: 1, createdAt: -1 });
stockMovementSchema.index({ productId: 1, createdAt: -1 });

const StockMovement = mongoose.models.StockMovement || mongoose.model('StockMovement', stockMovementSchema);

module.exports = StockMovement;
module.exports.MOVEMENT_TYPES = MOVEMENT_TYPES;
