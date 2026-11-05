const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { app, request, startDatabase, stopDatabase, clearDatabase, auth, expect } = require('./helpers');
const { User, Order, BranchStock, StockEntry } = require('../models');
const { seedDemo } = require('../services/demoSeed');

const PASSWORD = 'demo1234';

before(async () => {
  await startDatabase();
  await clearDatabase();
  await User.create({
    username: 'admin@cleanstock.com',
    email: 'admin@cleanstock.com',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    role: 'Administrador',
    isActive: true
  });
});
after(stopDatabase);

describe('Datos de demostración', () => {
  test('cargan un escenario completo a través de la API', async () => {
    const { users } = await seedDemo(app, PASSWORD);
    expect(users).toHaveLength(6);

    const statuses = (await Order.find().lean()).map(o => o.status).sort();
    expect(statuses).toEqual(['DESPACHADO', 'ENTREGADO', 'EN_PREPARACION', 'PENDIENTE', 'PENDIENTE_VALIDACION', 'RECHAZADO']);
    expect(await StockEntry.countDocuments({ status: 'VENCIDO' })).toBe(1);

    // Ningún stock queda negativo ni con más reservado que lo que hay
    const stock = await BranchStock.find().lean();
    expect(stock.every(s => s.quantity >= 0 && (s.reservedQuantity || 0) <= s.quantity)).toBe(true);

    // Cada usuario de demostración puede ingresar
    for (const username of users) {
      const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
      expect(res.status).toBe(200);
    }

    const token = (await request(app).post('/api/auth/login').send({ username: 'admin@cleanstock.com', password: PASSWORD })).body.token;
    const alerts = (await request(app).get('/api/alerts').set(auth(token))).body.map(a => a.productName);
    expect(alerts.includes('TRAPO DE PISO')).toBe(true);
    expect(alerts.includes('GUANTES DE LÁTEX X100')).toBe(true);
  });

  test('no se cargan sobre una base que ya tiene datos', async () => {
    await assert.rejects(seedDemo(app, PASSWORD), /base vacía/);
  });
});
