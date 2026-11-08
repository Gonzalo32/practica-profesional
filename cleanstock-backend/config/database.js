const mongoose = require('mongoose');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cleanstock';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    console.log(`MongoDB Conectado: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.warn(`No se pudo conectar a MongoDB (${error.message}). Iniciando MongoDB en memoria...`);
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      const conn = await mongoose.connect(mongoUri);
      console.log(`MongoDB en memoria conectado exitosamente: ${mongoUri}`);
      return conn;
    } catch (memError) {
      console.error(`Error iniciando MongoDB en memoria: ${memError.message}`);
      process.exit(1);
    }
  }
};

module.exports = {
  connectDB,
  mongoose
};
