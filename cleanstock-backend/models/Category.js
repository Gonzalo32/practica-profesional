const { mongoose } = require('../config/database');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: { type: String, default: null }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

module.exports = Category;
