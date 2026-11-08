const { mongoose } = require('../config/database');

const settingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'general' },
  businessName: { type: String, default: 'Mi Negocio', trim: true },
  singleBranchMode: { type: Boolean, default: false },
  mainBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhysicalSpace', default: null }
}, {
  timestamps: true
});

const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

module.exports = Settings;
