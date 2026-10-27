const { describe, test, before, after, beforeEach } = require('node:test');
const { app, request, startDatabase, stopDatabase, clearDatabase, seedScenario, auth, createUser, login , expect } = require('./helpers');
const { BranchStock, StockEntry, StockMovement } = require('../models');

let s;

before(startDatabase);
after(stopDatabase);
beforeEach(async () => {
  await clearDatabase();
  s = await seedScenario();
  await request(app).post('/api/inventory/stock').set(auth(s.tokens.admin)).send({
    productId: s.product._id, branchId: s.central._id, quantity: 10, lotNumber: 'L-A', expirationDate: '2030-06-01'
  });
});

const stockOf = async (branch) => (await BranchStock.findOne({ branchId: branch._id, productId: s.product._id }).lean()) || { quantity: 0, reservedQuantity: 0 };

const createOrder = (token, quantity) => request(app).post('/api/orders').set(auth(token)).send({
  items: [{ productId: s.product._id, quantity }],
  fromBranchId: s.central._id,
  toBranchId: s.norte._id
});

const setStatus = (token, orderId, status) => request(app).put(`/api/orders/${orderId}/status`).set(auth(token)).send({ status });

describe('Pedidos entre sucursales', () => {
  test('los pedidos reciben un número correlativo', async () => {
    const first = await createOrder(s.tokens.solicitante, 1);
    const second = await createOrder(s.tokens.solicitante, 1);
    expect(first.body.order.code).toBe('PED-0001');
    expect(second.body.order.code).toBe('PED-0002');
  });

  test('pedidos simultáneos no pueden reservar más stock del disponible', async () => {
    const results = await Promise.all([
      createOrder(s.tokens.solicitante, 6),
      createOrder(s.tokens.solicitante, 6),
      createOrder(s.tokens.solicitante, 6)
    ]);
    const ok = results.filter(r => r.status === 201);
    expect(ok).toHaveLength(1);
    expect(results.filter(r => r.status === 400)).toHaveLength(2);
    expect((await stockOf(s.central)).reservedQuantity).toBe(6);
  });

  test('origen y destino no pueden ser la misma sucursal', async () => {
    const res = await request(app).post('/api/orders').set(auth(s.tokens.solicitante)).send({
      items: [{ productId: s.product._id, quantity: 1 }], fromBranchId: s.central._id, toBranchId: s.central._id
    });
    expect(res.status).toBe(400);
  });

  test('flujo completo: la entrega mueve stock y lotes entre sucursales', async () => {
    const { body } = await createOrder(s.tokens.solicitante, 4);
    const id = body.order.id;
    expect((await setStatus(s.tokens.despachante, id, 'EN_PREPARACION')).status).toBe(200);
    expect((await setStatus(s.tokens.despachante, id, 'DESPACHADO')).status).toBe(200);
    expect((await setStatus(s.tokens.solicitante, id, 'ENTREGADO')).status).toBe(200);

    const origin = await stockOf(s.central);
    expect(origin.quantity).toBe(6);
    expect(origin.reservedQuantity).toBe(0);
    expect((await stockOf(s.norte)).quantity).toBe(4);

    const movedLot = await StockEntry.findOne({ branchId: s.norte._id }).lean();
    expect(movedLot.lotNumber).toBe('L-A');
    expect(movedLot.remaining).toBe(4);
  });

  test('una entrega no se puede confirmar dos veces', async () => {
    const { body } = await createOrder(s.tokens.solicitante, 2);
    const id = body.order.id;
    await setStatus(s.tokens.admin, id, 'EN_PREPARACION');
    await setStatus(s.tokens.admin, id, 'DESPACHADO');
    const results = await Promise.all([setStatus(s.tokens.admin, id, 'ENTREGADO'), setStatus(s.tokens.admin, id, 'ENTREGADO')]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect((await stockOf(s.norte)).quantity).toBe(2);
  });

  test('si el sistema tenía menos stock del despachado se registra la discrepancia', async () => {
    const { body } = await createOrder(s.tokens.solicitante, 8);
    const id = body.order.id;
    // Alguien corrigió el stock por fuera del sistema: quedan 5 de las 8 reservadas
    await BranchStock.updateOne({ branchId: s.central._id, productId: s.product._id }, { quantity: 5 });
    await setStatus(s.tokens.admin, id, 'EN_PREPARACION');
    await setStatus(s.tokens.admin, id, 'DESPACHADO');
    const res = await setStatus(s.tokens.admin, id, 'ENTREGADO');

    expect(res.body.discrepancies).toEqual([{ productName: 'LAVANDINA 1L', missing: 3 }]);
    expect((await stockOf(s.central)).quantity).toBe(0);
    expect(await StockMovement.countDocuments({ type: 'DISCREPANCIA' })).toBe(1);
  });

  test('rechazar un pedido libera la reserva', async () => {
    const { body } = await createOrder(s.tokens.solicitante, 5);
    expect((await stockOf(s.central)).reservedQuantity).toBe(5);
    expect((await setStatus(s.tokens.admin, body.order.id, 'RECHAZADO')).status).toBe(200);
    expect((await stockOf(s.central)).reservedQuantity).toBe(0);
  });

  test('un solicitante no puede confirmar la entrega de un pedido ajeno', async () => {
    const { body } = await createOrder(s.tokens.solicitante, 1);
    await setStatus(s.tokens.admin, body.order.id, 'EN_PREPARACION');
    await setStatus(s.tokens.admin, body.order.id, 'DESPACHADO');
    const otro = await login(await createUser('Solicitante'));
    expect((await setStatus(otro, body.order.id, 'ENTREGADO')).status).toBe(400);
  });

  test('el listado de pedidos se puede paginar y filtrar por varios estados', async () => {
    for (let i = 0; i < 3; i++) await createOrder(s.tokens.solicitante, 1);
    const res = await request(app).get('/api/orders?page=1&limit=2&status=PENDIENTE,EN_PREPARACION').set(auth(s.tokens.admin));
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].OrderItems[0].Product.name).toBe('LAVANDINA 1L');
  });
});
