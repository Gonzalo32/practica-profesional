const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Category = require('./Category');

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  // T3.3 Control de duplicados: el nombre debe ser único para estandarizar el catálogo
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    set(val) {
      // Estandarización de nombre: mayúsculas para evitar duplicados ambiguos
      this.setDataValue('name', val.toUpperCase().trim());
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  minimumStock: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
});

// Relationships
Category.hasMany(Product, { foreignKey: 'categoryId' });
Product.belongsTo(Category, { foreignKey: 'categoryId' });

module.exports = Product;
