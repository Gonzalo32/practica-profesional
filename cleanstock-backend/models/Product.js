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
  // Perecedero: al ingresar stock se exige lote y vencimiento. Los productos cargados
  // antes de este campo lo toman como true para conservar el control que ya tenían.
  perishable: { type: Boolean, default: true },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  // Marca elegida de la lista de marcas (no se escribe a mano)
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

// El mismo nombre puede repetirse con distinta marca ("LAVANDINA 1L" de Ayudín y de Magistral)
productSchema.index({ name: 1, brandId: 1 }, { unique: true });

// Código interno (SKU) único solo cuando está cargado
productSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: 'string' } } });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

module.exports = Product;
