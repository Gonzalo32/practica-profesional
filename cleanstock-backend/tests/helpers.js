// Utilidades compartidas por los tests: base de datos en memoria y datos de prueba
process.env.JWT_SECRET = 'secreto_solo_para_tests';
process.env.LOGIN_RATE_LIMIT = '1000';

const bcrypt = require('bcryptjs');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { mongoose } = require('../config/database');
const app = require('../app');
const { User, PhysicalSpace, Product, Category } = require('../models');
const { clearSettingsCache } = require('../services/settingsService');

let mongoServer;

const startDatabase = async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await Promise.all(Object.values(mongoose.models).map(m => m.syncIndexes()));
};

const stopDatabase = async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
};

const clearDatabase = async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map(c => c.deleteMany({})));
  clearSettingsCache();
};

const PASSWORD = 'clave123';

const createUser = async (role, extra = {}) => {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const username = `${role.replace(/\s/g, '').toLowerCase()}${Math.random().toString(36).slice(2, 7)}@test.com`;
  return User.create({ username, email: username, passwordHash, role, firstName: role, lastName: 'Test', ...extra });
};

const login = async (user) => {
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password: PASSWORD });
  return res.body.token;
};

// Escenario base: dos sucursales, un producto y un usuario por rol
const seedScenario = async () => {
  const [central, norte] = await PhysicalSpace.create([
    { name: 'Central', type: 'sucursal' },
    { name: 'Norte', type: 'sucursal' }
  ]);
  const category = await Category.create({ name: 'Limpieza' });
  const product = await Product.create({ name: 'Lavandina 1L', categoryId: category._id, minimumStock: 5 });

  const admin = await createUser('Administrador');
  const responsable = await createUser('Usuario Responsable', { physicalSpaceId: central._id });
  const solicitante = await createUser('Solicitante', { physicalSpaceId: norte._id });
  const despachante = await createUser('Despachante');

  return {
    central,
    norte,
    category,
    product,
    admin,
    responsable,
    solicitante,
    despachante,
    tokens: {
      admin: await login(admin),
      responsable: await login(responsable),
      solicitante: await login(solicitante),
      despachante: await login(despachante)
    }
  };
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Aserciones con la misma forma que expect() de Jest, sobre node:assert
const assert = require('node:assert/strict');
const expect = (actual) => ({
  toBe: (expected) => assert.strictEqual(actual, expected),
  toEqual: (expected) => assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected),
  toHaveLength: (length) => assert.strictEqual(actual.length, length, `se esperaban ${length} elementos y hay ${actual.length}`),
  toMatch: (regex) => assert.match(actual, regex),
  toBeTruthy: () => assert.ok(actual),
  toBeDefined: () => assert.notStrictEqual(actual, undefined),
  toContain: (item) => assert.ok(actual.includes(item), `no contiene ${item}`)
});

module.exports = {
  expect,
  app,
  request,
  startDatabase,
  stopDatabase,
  clearDatabase,
  createUser,
  login,
  seedScenario,
  auth,
  PASSWORD
};
