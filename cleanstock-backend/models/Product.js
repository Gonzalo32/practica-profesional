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
  costPrice: { type: Number, default: 0, min: 0 },
  // Perecedero: al ingresar stock se exige lote y vencimiento. Los productos cargados
  // antes de este campo lo toman como true para conservar el control que ya tenían.
  perishable: { type: Boolean, default: true },
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

// Código interno (SKU) único solo cuando está cargado
productSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: 'string' } } });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

module.exports = Product;
