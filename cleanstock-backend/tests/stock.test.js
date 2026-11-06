const { describe, test, before, after, beforeEach } = require('node:test');
const { app, request, startDatabase, stopDatabase, clearDatabase, seedScenario, auth , expect } = require('./helpers');
const { BranchStock, StockEntry, StockMovement, Product } = require('../models');
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

  test('se ajustan varias variantes en un solo movimiento, y si una no alcanza no se cambia nada', async () => {
    await addEntry(s.tokens.admin, { lotNumber: 'A', expirationDate: '2029-01-01', quantity: 10 });
    await addEntry(s.tokens.admin, { lotNumber: 'B', expirationDate: '2030-01-01', quantity: 10 });
    await addEntry(s.tokens.admin, { lotNumber: 'C', expirationDate: '2031-01-01', quantity: 10 });
    const [a, b, c] = await Promise.all(['A', 'B', 'C'].map(n => StockEntry.findOne({ lotNumber: n }).lean()));
    const adjust = (adjustments) => request(app).post(`/api/branches/${s.central._id}/stock/adjust`).set(auth(s.tokens.responsable))
      .send({ productId: s.product._id, reason: 'Corrección de conteo', adjustments });
    const remaining = async () => (await StockEntry.find().sort({ lotNumber: 1 }).lean()).map(l => l.remaining);

    const ok = await adjust([{ lotId: a._id, quantity: -3 }, { lotId: b._id, quantity: 2 }, { lotId: c._id, quantity: -10 }]);
    expect(ok.status).toBe(200);
    expect(await remaining()).toEqual([7, 12, 0]);
    expect((await StockEntry.findOne({ lotNumber: 'C' })).status).toBe('AGOTADO');
    expect((await stockOf(s.central)).quantity).toBe(19);
    expect(await StockMovement.countDocuments({ type: 'AJUSTE' })).toBe(3);

    // B no tiene 20: no se toca ningún lote ni el total
    const bad = await adjust([{ lotId: a._id, quantity: -1 }, { lotId: b._id, quantity: -20 }]);
    expect(bad.status).toBe(400);
    expect(await remaining()).toEqual([7, 12, 0]);
    expect((await stockOf(s.central)).quantity).toBe(19);

    // Un lote repetido se rechaza
    expect((await adjust([{ lotId: a._id, quantity: -1 }, { lotId: a._id, quantity: -1 }])).status).toBe(400);
  });

  test('provisiones: una entrega con varios productos; pendiente no mueve stock y al aprobarla ingresan todos', async () => {
    const otro = await Product.create({ name: 'Detergente', categoryId: s.category._id, minimumStock: 2, perishable: false });
    const create = await request(app).post('/api/inventory/provisions').set(auth(s.tokens.responsable)).send({
      branchId: s.central._id,
      notes: 'Remito 123',
      items: [
        { productId: s.product._id, quantity: 10, lotNumber: 'PROV-1', expirationDate: '2030-01-01' },
        { productId: otro._id, quantity: 4 }
      ]
    });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe('PENDIENTE');
    expect(create.body.items.length).toBe(2);
    expect(create.body.totalUnits).toBe(14);

    // Pendiente: ni stock, ni lote, ni movimiento
    expect((await stockOf(s.central)).quantity).toBe(0);
    expect(await StockEntry.countDocuments()).toBe(0);
    expect(await StockMovement.countDocuments()).toBe(0);

    // Corregir una pendiente no necesita motivo y no toca el stock
    const itemId = create.body.items[0].id;
    const fix = await request(app).put(`/api/inventory/provisions/${create.body.id}`).set(auth(s.tokens.responsable))
      .send({ items: [{ id: itemId, quantity: 12 }] });
    expect(fix.status).toBe(200);
    expect((await stockOf(s.central)).quantity).toBe(0);

    // Un solicitante no puede aprobar
    expect((await request(app).post(`/api/inventory/provisions/${create.body.id}/approve`).set(auth(s.tokens.solicitante))).status).toBe(403);

    const approve = await request(app).post(`/api/inventory/provisions/${create.body.id}/approve`).set(auth(s.tokens.responsable));
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('APROBADA');
    expect((await stockOf(s.central)).quantity).toBe(12);
    expect((await BranchStock.findOne({ branchId: s.central._id, productId: otro._id }).lean()).quantity).toBe(4);
    expect((await StockEntry.findOne({ lotNumber: 'PROV-1' })).remaining).toBe(12);
    const movs = await StockMovement.find({ type: 'INGRESO' }).lean();
    expect(movs.length).toBe(2);
    expect(movs.every(m => m.subtype === 'PROVISION')).toBe(true);

    // Aprobar dos veces no la ingresa dos veces
    expect((await request(app).post(`/api/inventory/provisions/${create.body.id}/approve`).set(auth(s.tokens.admin))).status).toBe(400);
    expect((await stockOf(s.central)).quantity).toBe(12);

    const list = await request(app).get('/api/inventory/provisions').set(auth(s.tokens.responsable));
    expect(list.body.items.length).toBe(1);
    expect(list.body.items[0].status).toBe('APROBADA');
    expect(list.body.pending).toBe(0);
  });

  test('provisiones: corregir una aprobada mueve el lote y el stock por la diferencia', async () => {
    const created = await request(app).post('/api/inventory/provisions').set(auth(s.tokens.responsable)).send({
      branchId: s.central._id,
      items: [{ productId: s.product._id, quantity: 10, lotNumber: 'MAL', expirationDate: '2030-01-01' }]
    });
    const id = created.body.id;
    const itemId = created.body.items[0].id;
    await request(app).post(`/api/inventory/provisions/${id}/approve`).set(auth(s.tokens.responsable));

    // Salen 3 unidades del lote
    await request(app).post('/api/inventory/exit').set(auth(s.tokens.admin)).send({
      productId: s.product._id, branchId: s.central._id, quantity: 3, exitType: 'VENTA'
    });
    const edit = (data) => request(app).put(`/api/inventory/provisions/${id}`).set(auth(s.tokens.responsable)).send(data);

    expect((await edit({ items: [{ id: itemId, quantity: 8 }] })).status).toBe(400); // aprobada: falta el motivo
    expect((await edit({ reason: 'Remito', items: [{ id: itemId, quantity: 2 }] })).status).toBe(400); // menos de lo que ya salió

    const ok = await edit({ reason: 'Se cargó mal el remito', items: [{ id: itemId, quantity: 8, lotNumber: 'BIEN', expirationDate: '2031-06-30' }] });
    expect(ok.status).toBe(200);
    const lot = await StockEntry.findOne({ lotNumber: 'BIEN' }).lean();
    expect(lot.quantity).toBe(8);
    expect(lot.remaining).toBe(5);
    expect((await stockOf(s.central)).quantity).toBe(5);
    const mov = await StockMovement.findOne({ type: 'INGRESO' }).lean();
    expect(mov.quantity).toBe(8);
    expect(mov.lotNumber).toBe('BIEN');
    expect(mov.editedAt).toBeTruthy();
  });

  test('provisiones: un producto que vence exige lote y el responsable solo carga en su sucursal', async () => {
    const sinLote = await request(app).post('/api/inventory/provisions').set(auth(s.tokens.responsable)).send({
      branchId: s.central._id, items: [{ productId: s.product._id, quantity: 5 }]
    });
    expect(sinLote.status).toBe(400);
    const vacia = await request(app).post('/api/inventory/provisions').set(auth(s.tokens.responsable)).send({
      branchId: s.central._id, items: []
    });
    expect(vacia.status).toBe(400);
    const otraSucursal = await request(app).post('/api/inventory/provisions').set(auth(s.tokens.responsable)).send({
      branchId: s.norte._id, items: [{ productId: s.product._id, quantity: 5, lotNumber: 'X', expirationDate: '2030-01-01' }]
    });
    expect(otraSucursal.status).toBe(403);
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
