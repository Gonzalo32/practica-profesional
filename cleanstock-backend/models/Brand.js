const { mongoose } = require('../config/database');

const normalizeBrand = (name) => String(name || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const brandSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, required: true, unique: true }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

brandSchema.pre('validate', function () {
  if (this.name) {
    this.name = this.name.replace(/\s+/g, ' ').trim();
    this.normalizedName = normalizeBrand(this.name);
  }
});

const Brand = mongoose.models.Brand || mongoose.model('Brand', brandSchema);

module.exports = Brand;
module.exports.normalizeBrand = normalizeBrand;
