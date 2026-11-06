require('dotenv').config();
const bcrypt = require('bcryptjs');
const app = require('./app');
const { connectDB, mongoose, User } = require('./models');
const { seedDemo } = require('./services/demoSeed');

// Carga datos de demostración (sucursales, productos, lotes, proveedores, pedidos y un usuario por rol).
// Solo funciona sobre una base vacía: nunca borra ni pisa datos existentes.
// Uso: npm run seed:demo
async function main() {
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password) {
    console.error('Falta ADMIN_INITIAL_PASSWORD en el archivo .env. Definila y volvé a ejecutar el script.');
    process.exit(1);
  }

  try {
    await connectDB();

    if (!(await User.exists({ role: 'Administrador' }))) {
      await User.create({
        username: 'admin@cleanstock.com',
        email: 'admin@cleanstock.com',
        passwordHash: await bcrypt.hash(password, 10),
        role: 'Administrador',
        firstName: 'Administrador',
        lastName: 'Principal',
        isActive: true
      });
    }

    const { users } = await seedDemo(app, password);
    console.log('Datos de demostración cargados. Usuarios (todos con la clave de ADMIN_INITIAL_PASSWORD):');
    users.forEach(u => console.log(`  - ${u}`));
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(`No se cargaron los datos de demostración: ${err.message}`);
    process.exit(1);
  }
}

main();
