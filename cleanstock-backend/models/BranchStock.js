const { mongoose } = require('../config/database');

const branchStockSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PhysicalSpace',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: { type: Number, required: true, default: 0, min: 0 },
  reservedQuantity: { type: Number, required: true, default: 0, min: 0 },
  branchMinStock: { type: Number, default: null }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

branchStockSchema.index({ branchId: 1, productId: 1 }, { unique: true });

const BranchStock = mongoose.models.BranchStock || mongoose.model('BranchStock', branchStockSchema);

module.exports = BranchStock;
