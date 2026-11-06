const { describe, test, before, after, beforeEach } = require('node:test');
const { app, request, startDatabase, stopDatabase, clearDatabase, seedScenario, auth , expect } = require('./helpers');
const { BranchStock, StockEntry, StockMovement } = require('../models');
const { markExpiredLots } = require('../services/stockService');

let s;

before(startDatabase);
after(stopDatabase);
beforeEach(async () => {
  await clearDatabase();
  s = await seedScenario();
});

const addEntry = (token, data) => request(app).post('/api/inventory/stock').set(auth(token)).send({
  productId: s.product._id,
  branchId: s.central._id,
  quantity: 10,
  lotNumber: 'L-1',
  expirationDate: '2030-01-01',
  ...data
});

const stockOf = async (branch) => (await BranchStock.findOne({ branchId: branch._id, productId: s.product._id }).lean()) || { quantity: 0, reservedQuantity: 0 };

describe('Ingresos, egresos y lotes', () => {
  test('un ingreso crea el lote, suma stock y registra el movimiento', async () => {
    const res = await addEntry(s.tokens.responsable);
    expect(res.status).toBe(201);
    expect((await stockOf(s.central)).quantity).toBe(10);
    const lot = await StockEntry.findOne({ lotNumber: 'L-1' }).lean();
    expect(lot.remaining).toBe(10);
    expect(String(lot.branchId)).toBe(String(s.central._id));
    expect(await StockMovement.countDocuments({ type: 'INGRESO' })).toBe(1);
  });

  test('ingresos simultáneos no pierden unidades', async () => {
    await Promise.all(Array.from({ length: 8 }, (_, i) => addEntry(s.tokens.admin, { quantity: 5, lotNumber: `L-${i}` })));
    expect((await stockOf(s.central)).quantity).toBe(40);
  });

  test('un egreso descuenta stock en orden FEFO (primero el lote que vence antes)', async () => {
    await addEntry(s.tokens.admin, { lotNumber: 'TARDE', expirationDate: '2031-01-01', quantity: 5 });
    await addEntry(s.tokens.admin, { lotNumber: 'PRONTO', expirationDate: '2029-01-01', quantity: 5 });

    const res = await request(app).post('/api/inventory/exit').set(auth(s.tokens.admin)).send({
      productId: s.product._id, branchId: s.central._id, quantity: 7, exitType: 'VENTA'
    });
    expect(res.status).toBe(201);
    expect(res.body.lots.map(l => l.lotNumber)).toEqual(['PRONTO', 'TARDE']);
    expect((await StockEntry.findOne({ lotNumber: 'PRONTO' })).status).toBe('AGOTADO');
    expect((await StockEntry.findOne({ lotNumber: 'TARDE' })).remaining).toBe(3);
    expect((await stockOf(s.central)).quantity).toBe(3);
  });

  test('no se puede dar de baja stock reservado para pedidos', async () => {
    await addEntry(s.tokens.admin, { quantity: 10 });
    await BranchStock.updateOne({ branchId: s.central._id, productId: s.product._id }, { reservedQuantity: 8 });

    const res = await request(app).post('/api/inventory/exit').set(auth(s.tokens.admin)).send({
      productId: s.product._id, branchId: s.central._id, quantity: 5, exitType: 'ROTURA'
    });
    expect(res.status).toBe(400);
    expect((await stockOf(s.central)).quantity).toBe(10);
  });

  test('un responsable no puede registrar egresos de otra sucursal', async () => {
    const res = await request(app).post('/api/inventory/exit').set(auth(s.tokens.responsable)).send({
      productId: s.product._id, branchId: s.norte._id, quantity: 1, exitType: 'VENTA'
    });
    expect(res.status).toBe(403);
  });

  test('el ajuste manual negativo respeta lo reservado', async () => {
    await addEntry(s.tokens.admin, { quantity: 10 });
    await BranchStock.updateOne({ branchId: s.central._id, productId: s.product._id }, { reservedQuantity: 6 });
    const res = await request(app).post(`/api/branches/${s.central._id}/stock/adjust`).set(auth(s.tokens.admin))
      .send({ productId: s.product._id, quantity: -5, reason: 'Rotura' });
    expect(res.status).toBe(400);
    const ok = await request(app).post(`/api/branches/${s.central._id}/stock/adjust`).set(auth(s.tokens.admin))
      .send({ productId: s.product._id, quantity: -4, reason: 'Rotura' });
    expect(ok.status).toBe(200);
    expect((await stockOf(s.central)).quantity).toBe(6);
  });

  test('el ajuste manual de un lote puntual mueve solo ese lote', async () => {
    await addEntry(s.tokens.admin, { lotNumber: 'PRONTO', expirationDate: '2029-01-01', quantity: 5 });
    await addEntry(s.tokens.admin, { lotNumber: 'TARDE', expirationDate: '2031-01-01', quantity: 5 });
    const tarde = await StockEntry.findOne({ lotNumber: 'TARDE' }).lean();
    const adjust = (data) => request(app).post(`/api/branches/${s.central._id}/stock/adjust`).set(auth(s.tokens.responsable))
      .send({ productId: s.product._id, reason: 'Rotura', lotId: tarde._id, ...data });

    // Resta del lote elegido aunque no sea el que vence primero
    expect((await adjust({ quantity: -2 })).status).toBe(200);
    expect((await StockEntry.findOne({ lotNumber: 'TARDE' })).remaining).toBe(3);
    expect((await StockEntry.findOne({ lotNumber: 'PRONTO' })).remaining).toBe(5);
    expect((await stockOf(s.central)).quantity).toBe(8);
    expect((await StockMovement.findOne({ type: 'AJUSTE' }).lean()).lotNumber).toBe('TARDE');

    // No deja restar más de lo que tiene el lote, y no toca nada
    expect((await adjust({ quantity: -4 })).status).toBe(400);
    expect((await StockEntry.findOne({ lotNumber: 'TARDE' })).remaining).toBe(3);
    expect((await stockOf(s.central)).quantity).toBe(8);

    // Agotar el lote y volver a sumarle lo deja disponible
    expect((await adjust({ quantity: -3 })).status).toBe(200);
    expect((await StockEntry.findOne({ lotNumber: 'TARDE' })).status).toBe('AGOTADO');
    expect((await adjust({ quantity: 4 })).status).toBe(200);
    const after = await StockEntry.findOne({ lotNumber: 'TARDE' }).lean();
    expect(after.remaining).toBe(4);
    expect(after.status).toBe('DISPONIBLE');
    expect((await stockOf(s.central)).quantity).toBe(9);
  });

  test('el ajuste por lote rechaza lotes de otro producto o sucursal y respeta lo reservado', async () => {
    await addEntry(s.tokens.admin, { lotNumber: 'L-A', quantity: 10 });
    const lot = await StockEntry.findOne({ lotNumber: 'L-A' }).lean();

    const otherBranch = await request(app).post(`/api/branches/${s.norte._id}/stock/adjust`).set(auth(s.tokens.admin))
      .send({ productId: s.product._id, quantity: -1, reason: 'Rotura', lotId: lot._id });
    expect(otherBranch.status).toBe(404);

    await BranchStock.updateOne({ branchId: s.central._id, productId: s.product._id }, { reservedQuantity: 8 });
    const res = await request(app).post(`/api/branches/${s.central._id}/stock/adjust`).set(auth(s.tokens.admin))
      .send({ productId: s.product._id, quantity: -5, reason: 'Rotura', lotId: lot._id });
    expect(res.status).toBe(400);
    // El lote vuelve a quedar como estaba
    expect((await StockEntry.findOne({ lotNumber: 'L-A' })).remaining).toBe(10);
    expect((await stockOf(s.central)).quantity).toBe(10);
  });

  test('los lotes vencidos se marcan y aparecen en las alertas de vencimiento', async () => {
    await addEntry(s.tokens.admin, { lotNumber: 'VIEJO', expirationDate: '2020-01-01', quantity: 3 });
    const soon = new Date();
    soon.setDate(soon.getDate() + 5);
    await addEntry(s.tokens.admin, { lotNumber: 'PRONTO', expirationDate: soon.toISOString().slice(0, 10), quantity: 3 });
    await addEntry(s.tokens.admin, { lotNumber: 'LEJOS', expirationDate: '2035-01-01', quantity: 3 });

    expect(await markExpiredLots()).toBe(1);
    expect((await StockEntry.findOne({ lotNumber: 'VIEJO' })).status).toBe('VENCIDO');

    const res = await request(app).get('/api/alerts/expirations?days=30').set(auth(s.tokens.admin));
    expect(res.status).toBe(200);
    expect(res.body.map(e => e.lotNumber)).toEqual(['VIEJO', 'PRONTO']);
    expect(res.body[0].severity).toBe('VENCIDO');
    expect(res.body[1].severity).toBe('URGENTE');
  });

  test('un producto que nunca tuvo stock aparece como crítico en las alertas del administrador', async () => {
    const admin = await request(app).get('/api/alerts').set(auth(s.tokens.admin));
    expect(admin.status).toBe(200);
    const alert = admin.body.find(a => a.productId === String(s.product._id));
    expect(alert.severity).toBe('CRITICO');
    expect(alert.branchName).toBe('Ninguna sucursal');
    expect(alert.deficit).toBe(5);

    const kpis = await request(app).get('/api/alerts/kpis').set(auth(s.tokens.admin));
    expect(kpis.body.criticalAlerts).toBe(1);

    // Con stock por encima del mínimo deja de aparecer
    await addEntry(s.tokens.admin, { quantity: 10 });
    const after = await request(app).get('/api/alerts').set(auth(s.tokens.admin));
    expect(after.body).toHaveLength(0);
  });

  test('busca productos por código interno y no permite códigos repetidos', async () => {
    await request(app).put(`/api/inventory/products/${s.product._id}`).set(auth(s.tokens.admin)).send({ sku: 'lav-001' });
    const bySku = await request(app).get('/api/inventory/products?q=LAV-001').set(auth(s.tokens.admin));
    expect(bySku.body).toHaveLength(1);
    expect(bySku.body[0].sku).toBe('LAV-001');

    const other = await request(app).post('/api/inventory/products').set(auth(s.tokens.admin)).send({ name: 'Otro', sku: 'LAV-001' });
    expect(other.status).toBe(400);
    expect(other.body.message).toMatch(/código interno/);
  });

  test('un producto que no vence se ingresa sin lote ni vencimiento', async () => {
    const created = await request(app).post('/api/inventory/products').set(auth(s.tokens.admin)).send({ name: 'Fideos 500g', perishable: false });
    expect(created.status).toBe(201);
    const res = await request(app).post('/api/inventory/stock').set(auth(s.tokens.responsable)).send({
      productId: created.body._id, branchId: s.central._id, quantity: 12
    });
    expect(res.status).toBe(201);
    expect(res.body.newStock).toBe(12);
    expect(await StockEntry.countDocuments({ productId: created.body._id })).toBe(0);
  });

  test('un producto perecedero exige lote y vencimiento', async () => {
    const res = await addEntry(s.tokens.admin, { lotNumber: '', expirationDate: '' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/tiene vencimiento/);
  });

  test('el historial de movimientos se pagina y filtra por sucursal', async () => {
    for (let i = 0; i < 5; i++) await addEntry(s.tokens.admin, { quantity: 1, lotNumber: `P${i}` });
    await addEntry(s.tokens.admin, { quantity: 1, lotNumber: 'NORTE', branchId: s.norte._id });

    const res = await request(app).get(`/api/branches/movements?branchId=${s.central._id}&page=2&limit=2`).set(auth(s.tokens.admin));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(res.body.pages).toBe(3);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].branchName).toBe('Central');
  });
});
