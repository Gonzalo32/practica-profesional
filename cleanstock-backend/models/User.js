const { mongoose } = require('../config/database');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  firstName: { type: String, default: null },
  lastName: { type: String, default: null },
  email: { type: String, default: null },
  phone: { type: String, default: null },
  document: { type: String, default: null },
  cuil: { type: String, default: null },
  birthDate: { type: String, default: null },
  address: { type: String, default: null },
  zipCode: { type: String, default: null },
  passwordHash: { type: String, required: true },
  role: {
    type: String,
    enum: ['Administrador', 'Solicitante', 'Despachante', 'Usuario Responsable', 'Proveedor'],
    default: 'Solicitante'
  },
  isActive: { type: Boolean, default: true },
  physicalSpaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PhysicalSpace',
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
