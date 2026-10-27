const { mongoose } = require('../config/database');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    set: val => (val ? val.toUpperCase().trim() : val)
  },
  description: { type: String, default: null },
  minimumStock: { type: Number, default: 0 },
  sku: {
    type: String,
    default: null,
    set: val => (val ? String(val).toUpperCase().trim() : null)
  },
  barcode: {
    type: String,
    default: null,
    set: val => (val ? String(val).trim() : null)
  },
  costPrice: { type: Number, default: 0, min: 0 },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// SKU y código de barras únicos solo cuando están cargados
productSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: 'string' } } });
productSchema.index({ barcode: 1 }, { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

module.exports = Product;
