const { mongoose } = require('../config/database');

// Provisión: una entrega de un proveedor (como un remito), con uno o varios productos.
// Se carga PENDIENTE y recién cuando el Responsable o el Administrador la aprueba entran
// todos sus productos al stock de la sucursal (lotes y movimientos de INGRESO).
// Antes de eso no figura en los movimientos.
const provisionItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  lotNumber: { type: String, default: null },
  expirationDate: { type: Date, default: null },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
  // Lo que generó al aprobarse
  stockEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockEntry', default: null },
  movementId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockMovement', default: null }
});

const provisionSchema = new mongoose.Schema({
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhysicalSpace', required: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  notes: { type: String, default: null },
  items: {
    type: [provisionItemSchema],
    validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'La provisión necesita al menos un producto' }
  },
  status: { type: String, enum: ['PENDIENTE', 'APROBADA'], default: 'PENDIENTE' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  editedAt: { type: Date, default: null },
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

provisionSchema.index({ branchId: 1, createdAt: -1 });
provisionSchema.index({ supplierId: 1, createdAt: -1 });

const Provision = mongoose.models.Provision || mongoose.model('Provision', provisionSchema);

module.exports = Provision;
