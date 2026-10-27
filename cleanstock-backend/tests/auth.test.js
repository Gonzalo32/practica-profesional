const { describe, test, before, after, beforeEach } = require('node:test');
const { app, request, startDatabase, stopDatabase, clearDatabase, seedScenario, auth , expect } = require('./helpers');

let s;

before(startDatabase);
after(stopDatabase);
beforeEach(async () => {
  await clearDatabase();
  s = await seedScenario();
});

describe('Autenticación y seguridad', () => {
  test('login correcto devuelve token y datos del usuario', async () => {
    expect(s.tokens.admin).toBeTruthy();
    const me = await request(app).get('/api/auth/me').set(auth(s.tokens.admin));
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('Administrador');
  });

  test('login con contraseña incorrecta devuelve 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: s.admin.username, password: 'otra' });
    expect(res.status).toBe(401);
  });

  test('la ruta /api/auth/init ya no existe', async () => {
    const res = await request(app).post('/api/auth/init');
    expect(res.status).toBe(404);
  });

  test('las rutas protegidas exigen token', async () => {
    const res = await request(app).get('/api/inventory/products');
    expect(res.status).toBe(403);
  });

  test('un Solicitante no puede crear productos', async () => {
    const res = await request(app).post('/api/inventory/products').set(auth(s.tokens.solicitante)).send({ name: 'X' });
    expect(res.status).toBe(403);
  });

  test('la ruta de espacios físicos está montada', async () => {
    const res = await request(app).get('/api/spaces').set(auth(s.tokens.admin));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('los datos inválidos se rechazan con 400 y un mensaje claro', async () => {
    const res = await request(app).post('/api/inventory/stock').set(auth(s.tokens.admin)).send({
      productId: 'no-es-un-id', branchId: s.central._id, quantity: -3, lotNumber: 'L1', expirationDate: '2030-01-01'
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/inválido|mayor a 0/);
  });

  test('responde con encabezados de seguridad de helmet', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  test('el administrador no puede darse de baja a sí mismo', async () => {
    const res = await request(app).delete(`/api/users/${s.admin._id}`).set(auth(s.tokens.admin));
    expect(res.status).toBe(400);
  });
});
