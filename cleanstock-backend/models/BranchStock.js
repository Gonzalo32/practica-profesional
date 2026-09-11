const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// BranchStock: stock de cada producto en cada sucursal
const BranchStock = sequelize.define('BranchStock', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  branchId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: { min: 0 }
  },
  // Cantidad reservada por pedidos pendientes/en preparación (Módulo 5)
  reservedQuantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: { min: 0 }
  },
  // Stock mínimo específico para esta sucursal (sobreescribe el global del producto)
  branchMinStock: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null
  }
}, {
  // Clave única compuesta: cada par (sucursal, producto) es único
  indexes: [
    {
      unique: true,
      fields: ['branchId', 'productId']
    }
  ]
});

module.exports = BranchStock;
