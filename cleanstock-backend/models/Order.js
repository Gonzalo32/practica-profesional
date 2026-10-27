const { mongoose } = require('../config/database');

const orderSchema = new mongoose.Schema({
  // Número correlativo legible (PED-0001). Los pedidos anteriores a este cambio no lo tienen.
  number: { type: Number, default: null },
  status: {
    type: String,
    enum: ['PENDIENTE_VALIDACION', 'PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'RECHAZADO'],
    default: 'PENDIENTE'
  },
  requiresValidation: { type: Boolean, default: false },
  solicitanteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  validatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  fromBranchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PhysicalSpace',
    default: null
  },
  toBranchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PhysicalSpace',
    default: null
  },
  notes: { type: String, default: null }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

orderSchema.index({ number: 1 }, { unique: true, partialFilterExpression: { number: { $type: 'number' } } });

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

module.exports = Order;
