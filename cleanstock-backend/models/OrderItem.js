const { mongoose } = require('../config/database');

const preparedVariantSchema = new mongoose.Schema({
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockEntry', default: null },
  lotNumber: { type: String, default: null },
  expirationDate: { type: Date, default: null },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  quantity: { type: Number, required: true, min: 1 }
}, { _id: false });

const orderItemSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: { type: Number, required: true, min: 1 },
  dispatchedQuantity: { type: Number, default: null, min: 0 },
  preparedVariants: { type: [preparedVariantSchema], default: [] }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

const OrderItem = mongoose.models.OrderItem || mongoose.model('OrderItem', orderItemSchema);

module.exports = OrderItem;
