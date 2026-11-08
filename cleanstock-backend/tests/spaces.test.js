const { describe, test, before, after, beforeEach } = require('node:test');
const { app, request, startDatabase, stopDatabase, clearDatabase, seedScenario, auth, expect } = require('./helpers');

let s;

before(startDatabase);
after(stopDatabase);
beforeEach(async () => {
  await clearDatabase();
  s = await seedScenario();
});

const createSpace = (data, token = s.tokens.admin) => request(app).post('/api/spaces').set(auth(token)).send(data);

describe('Espacios físicos', () => {
  test('el administrador crea un espacio con datos válidos', async () => {
    const res = await createSpace({ name: '  Depósito Sur  ', type: 'dependencia', description: 'Planta baja' });
    expect(res.status).toBe(201);
    expect(res.body.space.name).toBe('Depósito Sur');
  });

  test('solo el administrador puede crear espacios', async () => {
    const res = await createSpace({ name: 'Depósito Sur', type: 'dependencia' }, s.tokens.responsable);
    expect(res.status).toBe(403);
  });

  test('rechaza un espacio sin nombre o con un tipo inválido', async () => {
    const sinNombre = await createSpace({ name: '   ', type: 'sector' });
    expect(sinNombre.status).toBe(400);
    expect(sinNombre.body.field).toBe('name');

    const tipoInvalido = await createSpace({ name: 'Depósito Sur', type: 'galpon' });
    expect(tipoInvalido.status).toBe(400);
    expect(tipoInvalido.body.field).toBe('type');
  });

  test('rechaza un nombre que no es texto', async () => {
    const res = await createSpace({ name: { $gt: '' }, type: 'sector' });
    expect(res.status).toBe(400);
  });

  test('al modificar valida el identificador y los campos', async () => {
    const idInvalido = await request(app).put('/api/spaces/123').set(auth(s.tokens.admin)).send({ name: 'Nuevo' });
    expect(idInvalido.status).toBe(400);

    const vacio = await request(app).put(`/api/spaces/${s.central._id}`).set(auth(s.tokens.admin)).send({ name: '' });
    expect(vacio.status).toBe(400);

    const ok = await request(app).put(`/api/spaces/${s.central._id}`).set(auth(s.tokens.admin)).send({ type: 'filial' });
    expect(ok.status).toBe(200);
    expect(ok.body.space.type).toBe('filial');
  });

  test('al eliminar rechaza un identificador inválido', async () => {
    const res = await request(app).delete('/api/spaces/no-es-un-id').set(auth(s.tokens.admin));
    expect(res.status).toBe(400);
  });
});
