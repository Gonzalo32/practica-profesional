const { mongoose } = require('../config/database');

const orderSchema = new mongoose.Schema({
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

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

module.exports = Order;
