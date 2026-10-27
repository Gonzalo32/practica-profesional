const { describe, test, before, after, beforeEach } = require('node:test');
const { app, request, startDatabase, stopDatabase, clearDatabase, seedScenario, auth, createUser, login , expect } = require('./helpers');
const { BranchStock, StockEntry, Product } = require('../models');

let s;

before(startDatabase);
after(stopDatabase);
beforeEach(async () => {
  await clearDatabase();
  s = await seedScenario();
});

const stockOf = async (branch) => (await BranchStock.findOne({ branchId: branch._id, productId: s.product._id }).lean()) || { quantity: 0 };

describe('Proveedores y órdenes de compra', () => {
  test('alta de proveedor con CUIT único', async () => {
    const data = { name: 'Química Sur SA', cuit: '30-12345678-9', productIds: [s.product._id] };
    const res = await request(app).post('/api/suppliers').set(auth(s.tokens.responsable)).send(data);
    expect(res.status).toBe(201);
    expect(res.body.productIds).toHaveLength(1);

    const dup = await request(app).post('/api/suppliers').set(auth(s.tokens.admin)).send({ name: 'Otra', cuit: '30-12345678-9' });
    expect(dup.status).toBe(400);
    expect(dup.body.message).toMatch(/CUIT/);

    const bad = await request(app).post('/api/suppliers').set(auth(s.tokens.admin)).send({ name: 'Mal', cuit: '123' });
    expect(bad.status).toBe(400);
  });

  test('recibir una orden de compra ingresa stock con lote, proveedor y costo', async () => {
    const supplier = (await request(app).post('/api/suppliers').set(auth(s.tokens.admin)).send({ name: 'Química Sur SA' })).body;
    const po = await request(app).post('/api/suppliers/purchase-orders').set(auth(s.tokens.admin)).send({
      supplierId: supplier.id, branchId: s.central._id, items: [{ productId: s.product._id, quantity: 12, unitCost: 210 }]
    });
    expect(po.status).toBe(201);
    expect(po.body.code).toBe('OC-0001');
    expect(po.body.total).toBe(2520);

    const receive = () => request(app).post(`/api/suppliers/purchase-orders/${po.body.id}/receive`).set(auth(s.tokens.admin)).send({
      lots: [{ productId: s.product._id, lotNumber: 'OC1-L1', expirationDate: '2031-03-01' }]
    });
    expect((await receive()).status).toBe(200);
    expect((await receive()).status).toBe(400); // no se puede recibir dos veces

    expect((await stockOf(s.central)).quantity).toBe(12);
    const lot = await StockEntry.findOne({ lotNumber: 'OC1-L1' }).lean();
    expect(String(lot.supplierId)).toBe(supplier.id);
    expect((await Product.findById(s.product._id)).costPrice).toBe(210);
  });

  test('al recibir una orden, los productos que no vencen no necesitan lote', async () => {
    const fideos = (await request(app).post('/api/inventory/products').set(auth(s.tokens.admin)).send({ name: 'Fideos 500g', perishable: false })).body;
    const supplier = (await request(app).post('/api/suppliers').set(auth(s.tokens.admin)).send({ name: 'Mayorista' })).body;
    const po = (await request(app).post('/api/suppliers/purchase-orders').set(auth(s.tokens.admin)).send({
      supplierId: supplier.id, branchId: s.central._id,
      items: [{ productId: fideos._id, quantity: 20 }, { productId: s.product._id, quantity: 5 }]
    })).body;

    const missingLot = await request(app).post(`/api/suppliers/purchase-orders/${po.id}/receive`).set(auth(s.tokens.admin)).send({ lots: [] });
    expect(missingLot.status).toBe(400);
    expect(missingLot.body.message).toMatch(/LAVANDINA/);

    const ok = await request(app).post(`/api/suppliers/purchase-orders/${po.id}/receive`).set(auth(s.tokens.admin)).send({
      lots: [{ productId: s.product._id, lotNumber: 'L9', expirationDate: '2031-01-01' }]
    });
    expect(ok.status).toBe(200);
    const fideosStock = await BranchStock.findOne({ branchId: s.central._id, productId: fideos._id }).lean();
    expect(fideosStock.quantity).toBe(20);
  });

  test('un usuario Proveedor solo ve las órdenes de su empresa', async () => {
    const a = (await request(app).post('/api/suppliers').set(auth(s.tokens.admin)).send({ name: 'Proveedor A' })).body;
    const b = (await request(app).post('/api/suppliers').set(auth(s.tokens.admin)).send({ name: 'Proveedor B' })).body;
    for (const sup of [a, b]) {
      await request(app).post('/api/suppliers/purchase-orders').set(auth(s.tokens.admin)).send({
        supplierId: sup.id, branchId: s.central._id, items: [{ productId: s.product._id, quantity: 1 }]
      });
    }
    const token = await login(await createUser('Proveedor', { supplierId: a.id }));
    const res = await request(app).get('/api/suppliers/purchase-orders').set(auth(token));
    expect(res.body).toHaveLength(1);
    expect(res.body[0].supplierName).toBe('Proveedor A');
    const create = await request(app).post('/api/suppliers').set(auth(token)).send({ name: 'Intruso' });
    expect(create.status).toBe(403);
  });
});

describe('Conteo físico de inventario', () => {
  test('al cerrar el conteo se ajustan las diferencias contra el stock actual', async () => {
    await request(app).post('/api/inventory/stock').set(auth(s.tokens.admin)).send({
      productId: s.product._id, branchId: s.central._id, quantity: 10, lotNumber: 'L', expirationDate: '2030-01-01'
    });

    const open = await request(app).post('/api/counts').set(auth(s.tokens.responsable)).send({ branchId: s.central._id });
    expect(open.status).toBe(201);
    expect(open.body.items[0].systemQty).toBe(10);

    const again = await request(app).post('/api/counts').set(auth(s.tokens.responsable)).send({ branchId: s.central._id });
    expect(again.status).toBe(400); // un solo conteo abierto por sucursal

    await request(app).put(`/api/counts/${open.body.id}`).set(auth(s.tokens.responsable))
      .send({ items: [{ productId: s.product._id, countedQty: 7 }] });
    const close = await request(app).post(`/api/counts/${open.body.id}/close`).set(auth(s.tokens.responsable));
    expect(close.status).toBe(200);
    expect(close.body.adjusted).toBe(1);
    expect((await stockOf(s.central)).quantity).toBe(7);
    expect((await StockEntry.findOne({ lotNumber: 'L' })).remaining).toBe(7);

    const detail = await request(app).get(`/api/counts/${open.body.id}`).set(auth(s.tokens.responsable));
    expect(detail.body.items[0].appliedDifference).toBe(-3);
  });

  test('un responsable no puede contar otra sucursal', async () => {
    const res = await request(app).post('/api/counts').set(auth(s.tokens.responsable)).send({ branchId: s.norte._id });
    expect(res.status).toBe(403);
  });
});

describe('Reportes', () => {
  test('el dashboard devuelve valorización, estados y movimientos de 30 días', async () => {
    await request(app).post('/api/inventory/stock').set(auth(s.tokens.admin)).send({
      productId: s.product._id, branchId: s.central._id, quantity: 3, lotNumber: 'L', expirationDate: '2030-01-01'
    });
    const res = await request(app).get('/api/reports/dashboard').set(auth(s.tokens.admin));
    expect(res.status).toBe(200);
    expect(res.body.inventoryValue).toBe(300);
    expect(res.body.movementsLast30).toHaveLength(30);
    expect(res.body.movementsLast30.at(-1).entradas).toBe(3);
    expect(res.body.topShortages[0].deficit).toBe(2);
  });

  test('la auditoría se pagina y se filtra por acción', async () => {
    const res = await request(app).get('/api/users/logs?page=1&limit=2&action=LOGIN').set(auth(s.tokens.admin));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.actions).toContain('LOGIN');
  });
});
