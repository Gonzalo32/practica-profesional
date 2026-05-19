const sequelize = require('../config/database');
const User = require('./User');
const ActivityLog = require('./ActivityLog');
const Category = require('./Category');
const Product = require('./Product');
const StockEntry = require('./StockEntry');
const Order = require('./Order');
const OrderItem = require('./OrderItem');

const syncDatabase = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('Base de datos sincronizada');
  } catch (error) {
    console.error('Error sincronizando DB:', error);
  }
};

module.exports = {
  sequelize,
  User,
  ActivityLog,
  syncDatabase
};
