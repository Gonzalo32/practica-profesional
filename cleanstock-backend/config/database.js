const mongoose = require('mongoose');
const dns = require('dns');

// Resolver DNS SRV usando DNS de Google para evitar ECONNREFUSED en Windows/proveedores locales
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Ignorar si el sistema no permite sobreescribir servidores DNS
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cleanstock';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URI);
    console.log(`MongoDB Conectado: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Error conectando a MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = {
  connectDB,
  mongoose
};
