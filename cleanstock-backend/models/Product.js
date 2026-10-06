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

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

module.exports = Product;
