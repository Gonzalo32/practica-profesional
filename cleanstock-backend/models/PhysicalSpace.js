const { mongoose } = require('../config/database');

const physicalSpaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: { type: String, default: null },
  address: { type: String, default: null },
  phone: { type: String, default: null },
  type: {
    type: String,
    enum: ['filial', 'Zona', 'sucursal', 'dependencia', 'sector'],
    default: 'sucursal'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

const PhysicalSpace = mongoose.models.PhysicalSpace || mongoose.model('PhysicalSpace', physicalSpaceSchema);

module.exports = PhysicalSpace;
