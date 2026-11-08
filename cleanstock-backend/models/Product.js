const { mongoose } = require('../config/database');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    set: val => (val ? val.toUpperCase().trim() : val)
  },
  description: { type: String, default: null },
  minimumStock: { type: Number, default: 0 },
  sku: {
    type: String,
    default: null,
    set: val => (val ? String(val).toUpperCase().trim() : null)
  },
  perishable: { type: Boolean, default: true },
  requiresApproval: { type: Boolean, default: false },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

productSchema.index({ name: 1, brandId: 1 }, { unique: true });

productSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: 'string' } } });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

module.exports = Product;
