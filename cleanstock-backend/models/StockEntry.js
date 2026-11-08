const { mongoose } = require('../config/database');

const stockEntrySchema = new mongoose.Schema({
  lotNumber: { type: String, required: true },
  expirationDate: { type: Date, default: null },
  quantity: { type: Number, required: true, min: 1 },
  remaining: { type: Number, default: null, min: 0 },
  status: {
    type: String,
    enum: ['DISPONIBLE', 'AGOTADO', 'VENCIDO'],
    default: 'DISPONIBLE'
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PhysicalSpace',
    default: null
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    default: null
  },
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    default: null
  },
  registeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

stockEntrySchema.pre('save', function () {
  if (this.isNew && (this.remaining === null || this.remaining === undefined)) {
    this.remaining = this.quantity;
  }
});

stockEntrySchema.index({ branchId: 1, productId: 1, expirationDate: 1 });

const StockEntry = mongoose.models.StockEntry || mongoose.model('StockEntry', stockEntrySchema);

module.exports = StockEntry;
