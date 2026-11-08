const { mongoose } = require('../config/database');

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true }, // Razón social
  cuit: { type: String, default: null, trim: true },
  contactName: { type: String, default: null },
  email: { type: String, default: null },
  phone: { type: String, default: null },
  address: { type: String, default: null },
  notes: { type: String, default: null },
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// CUIT único solo cuando está cargado
supplierSchema.index({ cuit: 1 }, { unique: true, partialFilterExpression: { cuit: { $type: 'string' } } });

const Supplier = mongoose.models.Supplier || mongoose.model('Supplier', supplierSchema);

module.exports = Supplier;
