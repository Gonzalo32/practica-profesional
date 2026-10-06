require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB, User } = require('./models');

async function seedAdmin() {
  try {
    await connectDB();

    const username = 'admin@cleanstock.com';
    const email = 'admin@cleanstock.com';
    const password = 'admin123';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let user = await User.findOne({ username });
    if (!user) {
      user = await User.findOne({ role: 'Administrador' });
    }

    if (user) {
      user.username = username;
      user.email = email;
      user.passwordHash = passwordHash;
      user.role = 'Administrador';
      user.firstName = 'Administrador';
      user.lastName = 'Principal';
      user.phone = '1122334455';
      user.document = '20-12345678-9';
      user.cuil = '20-12345678-9';
      user.birthDate = '1990-01-01';
      user.address = 'Av. Central 123';
      user.zipCode = '1000';
      user.isActive = true;
      await user.save();
      console.log('Usuario "admin@cleanstock.com" actualizado exitosamente con la clave "admin123".');
    } else {
      user = await User.create({
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
      });
      console.log('Usuario "admin@cleanstock.com" creado exitosamente con la clave "admin123".');
    }
    process.exit(0);
  } catch (err) {
    console.error('Error al generar el usuario admin:', err);
    process.exit(1);
  }
}

seedAdmin();
