require('dotenv').config();
const bcrypt = require('bcryptjs');
const app = require('./app');
const { syncDatabase, User } = require('./models');
const { markExpiredLots } = require('./services/stockService');

const PORT = process.env.PORT || 3000;

// Crea el administrador inicial solo si todavía no existe ninguno.
// Nunca pisa la contraseña de un administrador existente.
const autoSeedAdmin = async () => {
  try {
    const hasAdmin = await User.exists({ role: 'Administrador' });
    if (hasAdmin) return;

    const username = 'admin@cleanstock.com';
    const password = process.env.ADMIN_INITIAL_PASSWORD || 'admin123';
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
    console.log(`Usuario administrador inicial creado: ${username} (cambiá la contraseña después de ingresar)`);
  } catch (err) {
    console.error('Error creando el administrador inicial:', err.message);
  }
};

// Revisa los vencimientos al iniciar y luego una vez por hora
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

// Start Server
const startServer = async () => {
  await syncDatabase();
  await autoSeedAdmin();
  scheduleExpirationCheck();
  app.listen(PORT, () => {
    console.log(`Servidor de CleanStock corriendo en http://localhost:${PORT}`);
  });
};

startServer();
