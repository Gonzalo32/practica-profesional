const { connectDB, mongoose } = require('../config/database');
const User = require('./User');
const ActivityLog = require('./ActivityLog');
const Category = require('./Category');
const Product = require('./Product');
const StockEntry = require('./StockEntry');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const PhysicalSpace = require('./PhysicalSpace');
const BranchStock = require('./BranchStock');

const syncDatabase = async () => {
  await connectDB();
};

module.exports = {
  mongoose,
  connectDB,
  syncDatabase,
  User,
  ActivityLog,
  Category,
  Product,
  StockEntry,
  Order,
  OrderItem,
  PhysicalSpace,
  BranchStock
};
