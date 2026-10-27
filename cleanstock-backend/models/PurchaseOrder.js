const { mongoose } = require('../config/database');

const purchaseOrderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitCost: { type: Number, default: null, min: 0 }
}, { _id: false });

const purchaseOrderSchema = new mongoose.Schema({
  number: { type: Number, required: true, unique: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhysicalSpace', required: true },
  items: { type: [purchaseOrderItemSchema], validate: v => v.length > 0 },
  status: {
    type: String,
    enum: ['PENDIENTE', 'RECIBIDA', 'CANCELADA'],
    default: 'PENDIENTE'
  },
  notes: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  receivedAt: { type: Date, default: null }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

const PurchaseOrder = mongoose.models.PurchaseOrder || mongoose.model('PurchaseOrder', purchaseOrderSchema);

module.exports = PurchaseOrder;
