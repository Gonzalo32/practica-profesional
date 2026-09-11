const bcrypt = require('bcryptjs');
const { sequelize, User } = require('./models');

async function seedAdmin() {
  try {
    await sequelize.sync();

    const username = 'admin';
    const password = '1234';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let user = await User.findOne({ where: { username } });
    if (user) {
      user.passwordHash = passwordHash;
      user.role = 'Administrador';
      user.isActive = true;
      await user.save();
      console.log('Usuario "admin" actualizado exitosamente con la clave "1234".');
    } else {
      user = await User.create({
        username,
        passwordHash,
        role: 'Administrador',
        isActive: true
      });
      console.log('Usuario "admin" creado exitosamente con la clave "1234".');
    }
    process.exit(0);
  } catch (err) {
    console.error('Error al generar el usuario admin:', err);
    process.exit(1);
  }
}

seedAdmin();
