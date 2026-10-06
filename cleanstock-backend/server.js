require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { syncDatabase } = require('./models');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const branchRoutes = require('./routes/branchRoutes');
const alertRoutes = require('./routes/alertRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/alerts', alertRoutes);

// Test Route
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

const bcrypt = require('bcryptjs');
const { User } = require('./models');

const autoSeedAdmin = async () => {
  try {
    const username = 'admin@cleanstock.com';
    const email = 'admin@cleanstock.com';
    let user = await User.findOne({ username });
    if (!user) {
      user = await User.findOne({ role: 'Administrador' });
    }
    if (!user) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('admin123', salt);
      await User.create({
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
      console.log('Usuario admin auto-generado: admin@cleanstock.com / admin123');
    }
  } catch (err) {
    console.error('Error auto-seeding admin:', err.message);
  }
};

// Start Server
const startServer = async () => {
  await syncDatabase();
  await autoSeedAdmin();
  app.listen(PORT, () => {
    console.log(`Servidor de CleanStock corriendo en http://localhost:${PORT}`);
  });
};

startServer();

