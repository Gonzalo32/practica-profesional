const sequelize = require('../config/database');
const User = require('./User');
const ActivityLog = require('./ActivityLog');
const Category = require('./Category');
const Product = require('./Product');
const StockEntry = require('./StockEntry');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const PhysicalSpace = require('./PhysicalSpace');
const BranchStock = require('./BranchStock');

// --- Relaciones existentes ---
ActivityLog.belongsTo(Order, { foreignKey: 'orderId' });
Order.hasMany(ActivityLog, { foreignKey: 'orderId', as: 'Historial' });

PhysicalSpace.hasMany(User, { foreignKey: 'physicalSpaceId' });
User.belongsTo(PhysicalSpace, { foreignKey: 'physicalSpaceId', as: 'EspacioFisico' });

// --- Relaciones Order ↔ PhysicalSpace (sucursales de pedido) ---
PhysicalSpace.hasMany(Order, { foreignKey: 'fromBranchId', as: 'PedidosEnviados' });
Order.belongsTo(PhysicalSpace, { foreignKey: 'fromBranchId', as: 'SucursalOrigen' });

PhysicalSpace.hasMany(Order, { foreignKey: 'toBranchId', as: 'PedidosRecibidos' });
Order.belongsTo(PhysicalSpace, { foreignKey: 'toBranchId', as: 'SucursalDestino' });

// --- Relaciones BranchStock ---
PhysicalSpace.hasMany(BranchStock, { foreignKey: 'branchId', as: 'StockItems' });
BranchStock.belongsTo(PhysicalSpace, { foreignKey: 'branchId', as: 'Sucursal' });

Product.hasMany(BranchStock, { foreignKey: 'productId', as: 'StockPorSucursal' });
BranchStock.belongsTo(Product, { foreignKey: 'productId', as: 'Producto' });

const syncDatabase = async () => {
  try {
    // Sync existing tables without altering (safe for SQLite with FK constraints)
    await sequelize.sync({ force: false });

    // Explicitly create new BranchStock table if it doesn't exist
    await BranchStock.sync({ force: false });

    // Safely add new columns to existing tables (ignore errors if already exist)
    const qi = sequelize.getQueryInterface();
    const { DataTypes } = require('sequelize');

    const safeAddColumn = async (table, column, def) => {
      try {
        await qi.addColumn(table, column, def);
        console.log(`  + Columna "${column}" agregada a "${table}"`);
      } catch (e) {
        // Column already exists — ignore
      }
    };

    // New columns in Orders table
    await safeAddColumn('Orders', 'fromBranchId', { type: DataTypes.UUID, allowNull: true });
    await safeAddColumn('Orders', 'toBranchId',   { type: DataTypes.UUID, allowNull: true });
    await safeAddColumn('Orders', 'notes',         { type: DataTypes.TEXT, allowNull: true });

    // New column in PhysicalSpaces table
    await safeAddColumn('PhysicalSpaces', 'address', { type: DataTypes.STRING, allowNull: true });

    // New columns in BranchStock table (Módulo 5 — reserva de stock)
    await safeAddColumn('BranchStocks', 'reservedQuantity', { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 });
    await safeAddColumn('BranchStocks', 'branchMinStock',   { type: DataTypes.INTEGER, allowNull: true, defaultValue: null });

    // New columns in Users table (Ampliación de perfil)
    await safeAddColumn('Users', 'firstName', { type: DataTypes.STRING, allowNull: true });
    await safeAddColumn('Users', 'lastName', { type: DataTypes.STRING, allowNull: true });
    await safeAddColumn('Users', 'email', { type: DataTypes.STRING, allowNull: true });
    await safeAddColumn('Users', 'phone', { type: DataTypes.STRING, allowNull: true });
    await safeAddColumn('Users', 'document', { type: DataTypes.STRING, allowNull: true });

    console.log('Base de datos sincronizada');
  } catch (error) {
    console.error('Error sincronizando DB:', error);
  }
};

module.exports = {
  sequelize,
  User,
  ActivityLog,
  Category,
  Product,
  StockEntry,
  Order,
  OrderItem,
  PhysicalSpace,
  BranchStock,
  syncDatabase
};

