const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PhysicalSpace = sequelize.define('PhysicalSpace', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  type: {
    type: DataTypes.ENUM('filial', 'Zona', 'sucursal', 'dependencia', 'sector'),
    allowNull: false,
    defaultValue: 'sucursal'
  }
});

module.exports = PhysicalSpace;
