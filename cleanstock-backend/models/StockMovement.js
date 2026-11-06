const { mongoose } = require('../config/database');

// Registro estructurado de cada movimiento de stock (ingresos, egresos, ajustes,
// transferencias y conteos). Reemplaza la lectura de detalles de texto del ActivityLog.
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
  subtype: { type: String, default: null }, // ej: VENTA, ROTURA, DONACION...
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhysicalSpace', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true }, // positivo entra, negativo sale
  lotNumber: { type: String, default: null },
  expirationDate: { type: Date, default: null },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
  countId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryCount', default: null },
  reason: { type: String, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Ingresos: el lote que generó y, si se corrigió después, cuándo y quién
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
