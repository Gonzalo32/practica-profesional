const { mongoose } = require('../config/database');

const stockEntrySchema = new mongoose.Schema({
  lotNumber: { type: String, required: true },
  expirationDate: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
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

const StockEntry = mongoose.models.StockEntry || mongoose.model('StockEntry', stockEntrySchema);

module.exports = StockEntry;
