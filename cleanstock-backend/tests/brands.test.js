const { describe, test, before, after, beforeEach } = require('node:test');
const { app, request, startDatabase, stopDatabase, clearDatabase, seedScenario, auth, expect } = require('./helpers');
const { Product } = require('../models');

let s;

before(startDatabase);
after(stopDatabase);
beforeEach(async () => {
  await clearDatabase();
  await Product.syncIndexes();
  s = await seedScenario();
});

const createBrand = (body, token = s.tokens.responsable) => request(app).post('/api/inventory/brands').set(auth(token)).send(body);

describe('Marcas', () => {
  test('no se duplica una marca escrita con otras mayúsculas, tildes o espacios', async () => {
    const ok = await createBrand({ name: 'Ayudín' });
    expect(ok.status).toBe(201);

    for (const name of ['AYUDIN', 'ayudín', '  Ayudin  ']) {
      const dup = await createBrand({ name, force: true });
      expect(dup.status).toBe(409);
      expect(dup.body.existing.name).toBe('Ayudín');
    }
    const list = await request(app).get('/api/inventory/brands').set(auth(s.tokens.responsable));
    expect(list.body.length).toBe(1);
  });

  test('una marca parecida pide confirmación (posible error de tipeo) y se puede crear igual', async () => {
    await createBrand({ name: 'Ayudín' });
    const typo = await createBrand({ name: 'Ayudim' });
    expect(typo.status).toBe(409);
    expect(typo.body.similar[0].name).toBe('Ayudín');

    const forced = await createBrand({ name: 'Ayudim', force: true });
    expect(forced.status).toBe(201);
  });

  test('la búsqueda ignora mayúsculas y tildes', async () => {
    await createBrand({ name: 'Ayudín' });
    await createBrand({ name: 'Magistral' });
    const res = await request(app).get('/api/inventory/brands?q=AYUD').set(auth(s.tokens.responsable));
    expect(res.body.map(b => b.name)).toEqual(['Ayudín']);
  });

  test('el producto guarda la marca; renombrarla la corrige en todos sus productos', async () => {
    const brand = (await createBrand({ name: 'Ayudim', force: true })).body;
    const prod = await request(app).post('/api/inventory/products').set(auth(s.tokens.admin))
      .send({ name: 'Lavandina 2L', categoryId: s.category._id, brandId: brand.id, minimumStock: 5 });
    expect(prod.status).toBe(201);

    const fix = await request(app).put(`/api/inventory/brands/${brand.id}`).set(auth(s.tokens.admin)).send({ name: 'Ayudín' });
    expect(fix.status).toBe(200);

    const products = await request(app).get('/api/inventory/products').set(auth(s.tokens.admin));
    const lav = products.body.find(p => p.name === 'LAVANDINA 2L');
    expect(lav.Brand.name).toBe('Ayudín');

    // No se puede borrar mientras un producto la use
    expect((await request(app).delete(`/api/inventory/brands/${brand.id}`).set(auth(s.tokens.admin))).status).toBe(400);
  });

  test('el mismo nombre de producto puede existir con distinta marca, pero no repetido en la misma', async () => {
    const ayudin = (await createBrand({ name: 'Ayudín' })).body;
    const magistral = (await createBrand({ name: 'Magistral' })).body;
    const create = (brandId) => request(app).post('/api/inventory/products').set(auth(s.tokens.admin))
      .send({ name: 'Lavandina 5L', categoryId: s.category._id, brandId });
    expect((await create(ayudin.id)).status).toBe(201);
    expect((await create(magistral.id)).status).toBe(201);
    expect((await create(ayudin.id)).status).toBe(400);
  });

  test('la marca se carga en la provisión y en el ingreso manual, y queda en cada lote', async () => {
    const ayudin = (await createBrand({ name: 'Ayudín' })).body;
    const magistral = (await createBrand({ name: 'Magistral' })).body;
    const lotsOf = async () => (await request(app).get(`/api/inventory/lots?branchId=${s.central._id}&productId=${s.product._id}`)
      .set(auth(s.tokens.responsable))).body;

    // Provisión: la marca va en cada producto y pasa al lote al aprobarla
    const prov = await request(app).post('/api/inventory/provisions').set(auth(s.tokens.responsable)).send({
      branchId: s.central._id,
      items: [{ productId: s.product._id, quantity: 10, lotNumber: 'P-1', expirationDate: '2030-01-01', brandId: ayudin.id }]
    });
    expect(prov.status).toBe(201);
    expect(prov.body.items[0].brandName).toBe('Ayudín');
    await request(app).post(`/api/inventory/provisions/${prov.body.id}/approve`).set(auth(s.tokens.responsable));

    // Ingreso manual con otra marca
    const manual = await request(app).post('/api/inventory/stock').set(auth(s.tokens.responsable)).send({
      productId: s.product._id, branchId: s.central._id, quantity: 5, lotNumber: 'M-1', expirationDate: '2031-01-01', brandId: magistral.id
    });
    expect(manual.status).toBe(201);

    const lots = await lotsOf();
    expect(lots.map(l => `${l.lotNumber}:${l.brandName}`)).toEqual(['P-1:Ayudín', 'M-1:Magistral']);

    // Corregir la marca de una provisión aprobada la cambia también en el lote
    const fix = await request(app).put(`/api/inventory/provisions/${prov.body.id}`).set(auth(s.tokens.responsable))
      .send({ reason: 'Era otra marca', items: [{ id: prov.body.items[0].id, brandId: magistral.id }] });
    expect(fix.status).toBe(200);
    expect((await lotsOf()).find(l => l.lotNumber === 'P-1').brandName).toBe('Magistral');
  });

  test('un solicitante no puede crear marcas', async () => {
    expect((await createBrand({ name: 'Nueva' }, s.tokens.solicitante)).status).toBe(403);
  });
});
