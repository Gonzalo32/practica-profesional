const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  status: {
    type: DataTypes.ENUM('PENDIENTE_VALIDACION', 'PENDIENTE', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'RECHAZADO'),
    defaultValue: 'PENDIENTE'
  },
  requiresValidation: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Who requested it
  solicitanteId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  // Who approved it (if required)
  validatorId: {
    type: DataTypes.UUID,
    allowNull: true
  }
});

// Relationships
User.hasMany(Order, { foreignKey: 'solicitanteId', as: 'Pedidos' });
Order.belongsTo(User, { foreignKey: 'solicitanteId', as: 'Solicitante' });

User.hasMany(Order, { foreignKey: 'validatorId', as: 'Validaciones' });
Order.belongsTo(User, { foreignKey: 'validatorId', as: 'Validador' });

module.exports = Order;
