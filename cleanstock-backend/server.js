require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { syncDatabase } = require('./models');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const spaceRoutes = require('./routes/spaceRoutes');

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
app.use('/api/spaces', spaceRoutes);

// Test Route
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong' });
});

// Start Server
const startServer = async () => {
  await syncDatabase();
  app.listen(PORT, () => {
    console.log(`Servidor de CleanStock corriendo en http://localhost:${PORT}`);
  });
};

startServer();
