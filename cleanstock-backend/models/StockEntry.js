const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Product = require('./Product');
const User = require('./User');

const StockEntry = sequelize.define('StockEntry', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  lotNumber: {
    type: DataTypes.STRING,
    allowNull: false
  },
  expirationDate: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1
    }
  },
  status: {
    type: DataTypes.ENUM('DISPONIBLE', 'AGOTADO', 'VENCIDO'),
    defaultValue: 'DISPONIBLE'
  }
});

// Relationships
Product.hasMany(StockEntry, { foreignKey: 'productId' });
StockEntry.belongsTo(Product, { foreignKey: 'productId' });

User.hasMany(StockEntry, { foreignKey: 'registeredBy' });
StockEntry.belongsTo(User, { foreignKey: 'registeredBy' });

module.exports = StockEntry;
