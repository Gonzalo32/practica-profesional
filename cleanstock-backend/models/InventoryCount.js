const { mongoose } = require('../config/database');

const countItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  systemQty: { type: Number, required: true },
  countedQty: { type: Number, default: null, min: 0 },
  appliedDifference: { type: Number, default: null }
}, { _id: false });

const inventoryCountSchema = new mongoose.Schema({
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhysicalSpace', required: true },
  status: { type: String, enum: ['ABIERTO', 'CERRADO', 'CANCELADO'], default: 'ABIERTO' },
  items: [countItemSchema],
  notes: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  closedAt: { type: Date, default: null }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

const InventoryCount = mongoose.models.InventoryCount || mongoose.model('InventoryCount', inventoryCountSchema);

module.exports = InventoryCount;
