const { Product, Order } = require('../models');
const { markExpiredLots } = require('./stockService');

// Carga un escenario de demostración completo usando la propia API del sistema,
// así los datos pasan por las mismas validaciones y reglas de negocio que en el uso real
// (reservas, lotes FEFO, movimientos, auditoría). Necesita una base sin productos ni pedidos.
//
// Todos los usuarios de demostración usan la misma clave que el administrador de prueba
// (ADMIN_INITIAL_PASSWORD): no hay ninguna clave escrita en el código.

const ADMIN_USER = 'admin@cleanstock.com';

const daysFromNow = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const isDatabaseEmpty = async () => !(await Product.exists({})) && !(await Order.exists({}));

const seedDemo = async (app, password) => {
  if (!password) throw new Error('Falta ADMIN_INITIAL_PASSWORD en el .env');
  if (!(await isDatabaseEmpty())) {
    throw new Error('La base ya tiene productos o pedidos. Los datos de demostración solo se cargan en una base vacía.');
  }

  // Se levanta la aplicación en un puerto libre solo mientras dura la carga
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const call = async (token, method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${path}: ${data.message || res.status}`);
    return data;
  };
  const idOf = (doc) => doc.id || doc._id;
  const login = async (username) => (await call(null, 'POST', '/auth/login', { username, password })).token;

  try {
    let admin;
    try {
      admin = await login(ADMIN_USER);
    } catch {
      throw new Error(`No se pudo ingresar como ${ADMIN_USER} con ADMIN_INITIAL_PASSWORD. Corré "npm run seed:admin" y volvé a intentar.`);
    }

    // Sucursales
    const branch = async (name, type, address) => idOf(await call(admin, 'POST', '/branches', { name, type, address }));
    const central = await branch('Depósito Central', 'dependencia', 'Av. San Martín 1200');
    const norte = await branch('Sucursal Norte', 'sucursal', 'Belgrano 450');
    const sur = await branch('Sucursal Sur', 'sucursal', 'Mitre 980');

    // Categorías y productos
    const category = async (name) => idOf(await call(admin, 'POST', '/inventory/categories', { name }));
    const limpieza = await category('Limpieza');
    const higiene = await category('Higiene personal');
    const descartables = await category('Descartables');

    // Marcas: se eligen de una lista, así no quedan escritas de distintas formas
    const brand = async (name) => idOf(await call(admin, 'POST', '/inventory/brands', { name, force: true }));
    const b = {
      ayudin: await brand('Ayudín'),
      magistral: await brand('Magistral'),
      lysoform: await brand('Lysoform'),
      dove: await brand('Dove'),
      elite: await brand('Elite'),
      cleanPro: await brand('CleanPro')
    };

    const product = async (name, categoryId, minimumStock, sku, perishable = true, brandId = null) =>
      idOf(await call(admin, 'POST', '/inventory/products', { name, categoryId, minimumStock, sku, perishable, brandId }));
    const p = {
      lavandina: await product('Lavandina 1L', limpieza, 20, 'LIM-001', true, b.ayudin),
      detergente: await product('Detergente 750ml', limpieza, 15, 'LIM-002', true, b.magistral),
      desinfectante: await product('Desinfectante de pisos 900ml', limpieza, 12, 'LIM-003', true, b.lysoform),
      alcoholGel: await product('Alcohol en gel 500ml', higiene, 10, 'HIG-001', true, b.cleanPro),
      jabon: await product('Jabón líquido 1L', higiene, 10, 'HIG-002', true, b.dove),
      papel: await product('Papel higiénico x4', descartables, 30, 'DES-001', false, b.elite),
      bolsas: await product('Bolsas de residuos x10', descartables, 25, 'DES-002', false, b.cleanPro),
      guantes: await product('Guantes de látex x100', descartables, 5, 'DES-003', false, b.cleanPro),
      // Nunca se cargó stock: aparece como crítico en las alertas del administrador
      trapo: await product('Trapo de piso', limpieza, 8, 'LIM-004', false)
    };

    // Proveedores
    const quimica = idOf(await call(admin, 'POST', '/suppliers', {
      name: 'Química del Sur SA', cuit: '30-71234567-8', contactName: 'Laura Gómez', phone: '011 4555-1200',
      email: 'ventas@quimicadelsur.example', productIds: [p.lavandina, p.detergente, p.desinfectante, p.alcoholGel, p.jabon]
    }));
    const papelera = idOf(await call(admin, 'POST', '/suppliers', {
      name: 'Papelera Andina SRL', cuit: '30-79876543-2', contactName: 'Martín Ruiz', phone: '011 4777-3400',
      email: 'pedidos@papeleraandina.example', productIds: [p.papel, p.bolsas, p.guantes, p.trapo]
    }));

    // Usuarios, uno por rol
    const user = (username, role, extra) => call(admin, 'POST', '/users', { username, password, role, ...extra });
    await user('responsable@cleanstock.com', 'Usuario Responsable', { physicalSpaceId: central, firstName: 'Carla', lastName: 'Méndez' });
    await user('norte@cleanstock.com', 'Solicitante', { physicalSpaceId: norte, firstName: 'Diego', lastName: 'Sosa' });
    await user('sur@cleanstock.com', 'Solicitante', { physicalSpaceId: sur, firstName: 'Paula', lastName: 'Ferreyra' });
    await user('despachante@cleanstock.com', 'Despachante', { physicalSpaceId: central, firstName: 'Nicolás', lastName: 'Acosta' });
    await user('proveedor@cleanstock.com', 'Proveedor', { supplierId: quimica, firstName: 'Laura', lastName: 'Gómez' });

    const responsable = await login('responsable@cleanstock.com');
    const solNorte = await login('norte@cleanstock.com');
    const solSur = await login('sur@cleanstock.com');
    const despachante = await login('despachante@cleanstock.com');

    // Marca habitual de cada producto: se usa al ingresar mercadería si no se indica otra
    const brandOf = {
      [p.lavandina]: b.ayudin, [p.detergente]: b.magistral, [p.desinfectante]: b.lysoform,
      [p.alcoholGel]: b.cleanPro, [p.jabon]: b.dove, [p.papel]: b.elite, [p.bolsas]: b.cleanPro, [p.guantes]: b.cleanPro
    };

    // Ingresos de stock en el depósito, con lotes, vencimientos y marcas
    const entry = (productId, quantity, lotNumber, days, supplierId, brandId = brandOf[productId]) => call(responsable, 'POST', '/inventory/stock', {
      productId, branchId: central, quantity, supplierId, brandId,
      ...(lotNumber ? { lotNumber, expirationDate: daysFromNow(days) } : {})
    });
    await entry(p.lavandina, 80, 'LAV-2611', 240, quimica);
    await entry(p.lavandina, 15, 'LAV-2605', 5, quimica, b.magistral); // otra marca; vence en 5 días: urgente
    await entry(p.detergente, 60, 'DET-2702', 300, quimica);
    await entry(p.desinfectante, 8, 'DES-2610', 20, quimica); // por debajo del mínimo y por vencer
    await entry(p.alcoholGel, 40, 'ALC-2701', 180, quimica);
    await entry(p.alcoholGel, 6, 'ALC-2510', -10, quimica); // vencido
    await entry(p.jabon, 35, 'JAB-2703', 200, quimica);
    await entry(p.papel, 120, null, 0, papelera);
    await entry(p.bolsas, 90, null, 0, papelera);
    await entry(p.guantes, 3, null, 0, papelera); // stock bajo
    await markExpiredLots();

    // Provisiones de proveedores (cada una es una entrega con varios productos, cada uno con su marca):
    // una ya aprobada (ingresó al stock) y dos pendientes de aprobar
    const lotItem = (productId, quantity, lotNumber, days, brandId = brandOf[productId]) =>
      ({ productId, quantity, lotNumber, expirationDate: daysFromNow(days), brandId });
    const provision = async (supplierId, notes, items) => idOf(await call(responsable, 'POST', '/inventory/provisions', {
      branchId: central, supplierId, notes, items
    }));
    const aprobada = await provision(quimica, 'Remito 0001-00004512', [
      lotItem(p.jabon, 24, 'JAB-2705', 260),
      lotItem(p.detergente, 12, 'DET-2705', 330)
    ]);
    await call(responsable, 'POST', `/inventory/provisions/${aprobada}/approve`);
    await provision(quimica, 'Llegó sin remito, a confirmar', [
      lotItem(p.lavandina, 30, 'LAV-2612', 250, b.magistral),
      lotItem(p.alcoholGel, 18, 'ALC-2703', 200),
      lotItem(p.desinfectante, 10, 'DES-2704', 220)
    ]);
    await provision(papelera, 'Remito 0003-00000877', [
      { productId: p.guantes, quantity: 20, brandId: b.cleanPro },
      { productId: p.bolsas, quantity: 50, brandId: b.cleanPro }
    ]);

    // Pedidos de las sucursales al depósito, en distintos estados
    const order = async (token, toBranchId, items, notes) =>
      (await call(token, 'POST', '/orders', { fromBranchId: central, toBranchId, items, notes })).order;
    const status = (token, id, value) => call(token, 'PUT', `/orders/${id}/status`, { status: value });

    // Entregado: la sucursal Norte ya tiene stock propio
    const entregado = await order(solNorte, norte, [
      { productId: p.lavandina, quantity: 20 }, { productId: p.papel, quantity: 40 }, { productId: p.jabon, quantity: 12 }
    ], 'Reposición semanal');
    await status(despachante, entregado.id, 'EN_PREPARACION');
    await status(despachante, entregado.id, 'DESPACHADO');
    await status(solNorte, entregado.id, 'ENTREGADO');

    // Despachado: Sur tiene que confirmar la recepción
    const enCamino = await order(solSur, sur, [{ productId: p.detergente, quantity: 10 }, { productId: p.bolsas, quantity: 20 }], 'Pedido quincenal');
    await status(despachante, enCamino.id, 'EN_PREPARACION');
    await status(despachante, enCamino.id, 'DESPACHADO');

    // En preparación y pendiente: trabajo para el despachante
    const preparando = await order(solNorte, norte, [{ productId: p.alcoholGel, quantity: 8 }], null);
    await status(despachante, preparando.id, 'EN_PREPARACION');
    await order(solSur, sur, [{ productId: p.papel, quantity: 30 }, { productId: p.jabon, quantity: 6 }], 'Urgente para el fin de semana');

    // Más de 50 unidades de un producto: espera la aprobación del administrador
    await order(solNorte, norte, [{ productId: p.bolsas, quantity: 60 }], 'Evento de fin de mes');

    // Rechazado por el administrador
    const rechazado = await order(solSur, sur, [{ productId: p.lavandina, quantity: 10 }], 'Pedido duplicado');
    await status(admin, rechazado.id, 'RECHAZADO');

    // Una venta en la sucursal Norte
    await call(admin, 'POST', '/inventory/exit', {
      productId: p.papel, branchId: norte, quantity: 6, exitType: 'VENTA', description: 'Venta mostrador'
    });

    return {
      users: ['admin@cleanstock.com', 'responsable@cleanstock.com', 'norte@cleanstock.com', 'sur@cleanstock.com', 'despachante@cleanstock.com', 'proveedor@cleanstock.com']
    };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

module.exports = { seedDemo, isDatabaseEmpty };
