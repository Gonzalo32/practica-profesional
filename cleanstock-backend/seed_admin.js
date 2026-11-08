require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB, User } = require('./models');

async function seedAdmin() {
  try {
    const password = process.env.ADMIN_INITIAL_PASSWORD;
    if (!password) {
      console.error('Falta ADMIN_INITIAL_PASSWORD en el archivo .env. Definila y volvé a ejecutar el script.');
      process.exit(1);
    }

    await connectDB();

    const username = 'admin@cleanstock.com';
    const email = 'admin@cleanstock.com';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const testData = {
      username,
      email,
      passwordHash,
      role: 'Administrador',
      firstName: 'Administrador',
      lastName: 'Principal',
      phone: '1122334455',
      document: '20-12345678-9',
      cuil: '20-12345678-9',
      birthDate: '1990-01-01',
      address: 'Av. Central 123',
      zipCode: '1000',
      isActive: true
    };

    let user = await User.findOne({ username });
    if (!user) {
      user = await User.findOne({ role: 'Administrador' });
    }

    if (user) {
      Object.assign(user, testData);
      await user.save();
      console.log(`Usuario de prueba "${username}" actualizado con la clave de ADMIN_INITIAL_PASSWORD.`);
    } else {
      await User.create(testData);
      console.log(`Usuario de prueba "${username}" creado con la clave de ADMIN_INITIAL_PASSWORD.`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Error al generar el usuario admin:', err);
    process.exit(1);
  }
}

seedAdmin();
