require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const app = require('./app');
const { syncDatabase, User, Product } = require('./models');
const { markExpiredLots } = require('./services/stockService');
const { seedDemo, isDatabaseEmpty } = require('./services/demoSeed');

const PORT = process.env.PORT || 3000;

const autoSeedAdmin = async () => {
  try {
    const hasAdmin = await User.exists({ role: 'Administrador' });
    if (hasAdmin) return;

    const username = 'admin@cleanstock.com';
    const generated = !process.env.ADMIN_INITIAL_PASSWORD;
    const password = process.env.ADMIN_INITIAL_PASSWORD || crypto.randomBytes(9).toString('base64url');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    await User.create({
      username,
      email: username,
      passwordHash,
      role: 'Administrador',
      firstName: 'Administrador',
      lastName: 'Principal',
      isActive: true
    });
    console.log(`Usuario administrador de prueba creado: ${username}`);
    if (generated) {
      console.log(`Falta ADMIN_INITIAL_PASSWORD en el .env; se generó la clave temporal: ${password}`);
    }
    console.log('Cambiá la contraseña después de ingresar.');
  } catch (err) {
    console.error('Error creando el administrador inicial:', err.message);
  }
};

const scheduleExpirationCheck = () => {
  const run = async () => {
    try {
      const expired = await markExpiredLots();
      if (expired > 0) console.log(`${expired} lote(s) marcados como VENCIDOS`);
    } catch (err) {
      console.error('Error revisando vencimientos:', err.message);
    }
  };
  run();
  setInterval(run, 60 * 60 * 1000).unref();
};

const autoSeedDemo = async () => {
  if (process.env.DEMO_DATA !== 'true') return;
  try {
    if (!(await isDatabaseEmpty())) return;
    await seedDemo(app, process.env.ADMIN_INITIAL_PASSWORD);
    console.log('Datos de demostración cargados (los usuarios usan la clave de ADMIN_INITIAL_PASSWORD).');
  } catch (err) {
    console.error('No se cargaron los datos de demostración:', err.message);
  }
};

const syncProductIndexes = async () => {
  try {
    await Product.syncIndexes();
  } catch (error) {
    console.error('No se pudieron actualizar los índices de productos:', error.message);
  }
};

const startServer = async () => {
  await syncDatabase();
  await syncProductIndexes();
  await autoSeedAdmin();
  await autoSeedDemo();
  scheduleExpirationCheck();
  app.listen(PORT, () => {
    console.log(`Servidor de CleanStock corriendo en http://localhost:${PORT}`);
  });
};

startServer();
