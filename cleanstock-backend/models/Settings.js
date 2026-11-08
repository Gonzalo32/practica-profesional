const { mongoose } = require('../config/database');

// Configuración general del negocio (un único documento con _id "general")
const settingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'general' },
  businessName: { type: String, default: 'Mi Negocio', trim: true },
  // Modo para comercios con un solo local: oculta sucursales, pedidos entre sucursales y despacho
  singleBranchMode: { type: Boolean, default: false },
  // Local que se usa en todas las operaciones cuando el modo de un solo local está activo
  mainBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhysicalSpace', default: null }
}, {
  timestamps: true
});

const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

module.exports = Settings;
