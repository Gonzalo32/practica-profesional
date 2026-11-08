const { describe, test, before, after, beforeEach } = require('node:test');
const { app, request, startDatabase, stopDatabase, clearDatabase, seedScenario, auth, createUser, login, expect } = require('./helpers');
const { PhysicalSpace, User } = require('../models');

let s;

before(startDatabase);
after(stopDatabase);
beforeEach(async () => {
  await clearDatabase();
  s = await seedScenario();
});

const setSettings = (data) => request(app).put('/api/settings').set(auth(s.tokens.admin)).send(data);

describe('Configuración del negocio y modo de un solo local', () => {
  test('por defecto el negocio trabaja con varias sucursales', async () => {
    const res = await request(app).get('/api/settings').set(auth(s.tokens.solicitante));
    expect(res.status).toBe(200);
    expect(res.body.singleBranchMode).toBe(false);
  });

  test('solo el administrador puede cambiar la configuración', async () => {
    const res = await request(app).put('/api/settings').set(auth(s.tokens.responsable)).send({ businessName: 'Otro' });
    expect(res.status).toBe(403);
  });

  test('con sucursales cargadas hay que elegir el local principal', async () => {
    const res = await setSettings({ singleBranchMode: true });
    expect(res.status).toBe(400);
    const ok = await setSettings({ singleBranchMode: true, mainBranchId: s.central._id, businessName: 'Almacén Don José' });
    expect(ok.status).toBe(200);
    expect(ok.body.mainBranch.name).toBe('Central');
    expect(ok.body.businessName).toBe('Almacén Don José');
  });

  test('si no hay locales cargados se crea uno con el nombre del negocio', async () => {
    await PhysicalSpace.deleteMany({});
    const res = await setSettings({ singleBranchMode: true, businessName: 'Despensa La Esquina' });
    expect(res.status).toBe(200);
    expect(res.body.mainBranch.name).toBe('Despensa La Esquina');
  });

  test('un empleado sin sucursal asignada opera en el local principal', async () => {
    const empleado = await createUser('Usuario Responsable');
    const token = await login(empleado);
    const denied = await request(app).get('/api/branches/my-branch/stock').set(auth(token));
    expect(denied.status).toBe(403);

    await setSettings({ singleBranchMode: true, mainBranchId: s.central._id });
    const allowed = await request(app).get('/api/branches/my-branch/stock').set(auth(token));
    expect(allowed.status).toBe(200);
    expect(allowed.body.branch.name).toBe('Central');
    const otherBranch = await request(app).get(`/api/branches/${s.norte._id}/stock`).set(auth(token));
    expect(otherBranch.status).toBe(403);
  });

  test('los usuarios nuevos quedan asignados al local principal', async () => {
    await setSettings({ singleBranchMode: true, mainBranchId: s.central._id });
    const res = await request(app).post('/api/users').set(auth(s.tokens.admin)).send({
      username: 'empleado@local.com', password: 'clave123', role: 'Usuario Responsable', firstName: 'Ana', lastName: 'Ruiz'
    });
    expect(res.status).toBe(201);
    const user = await User.findById(res.body.user.id);
    expect(String(user.physicalSpaceId)).toBe(String(s.central._id));
  });

  test('no se puede eliminar el local principal', async () => {
    await setSettings({ singleBranchMode: true, mainBranchId: s.central._id });
    const res = await request(app).delete(`/api/branches/${s.central._id}`).set(auth(s.tokens.admin));
    expect(res.status).toBe(400);
  });
});
