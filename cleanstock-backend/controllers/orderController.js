const { Order, OrderItem, Product, ActivityLog, PhysicalSpace, BranchStock, StockEntry, Counter, nextSequence } = require('../models');
const stock = require('../services/stockService');
const { toId, formatOrderCode, parsePagination } = require('../utils/format');
const { effectiveBranchId } = require('../services/settingsService');

// Une ítems repetidos del mismo producto en uno solo
const mergeItems = (items) => {
  const merged = new Map();
  for (const item of items) {
    const key = String(item.productId);
    merged.set(key, (merged.get(key) || 0) + parseInt(item.quantity, 10));
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
};

// Un pedido con más de esta cantidad de un mismo producto o con un producto marcado con requiresApproval pasa a Revisión
const VALIDATION_THRESHOLD = 50;

// T4.2 Crear una Orden de Pedido a partir de un carrito
const createOrder = async (req, res) => {
  const reserved = [];
  try {
    const { fromBranchId, toBranchId, notes } = req.body;
    const items = mergeItems(req.body.items);

    if (fromBranchId && toBranchId && String(fromBranchId) === String(toBranchId)) {
      return res.status(400).json({ message: 'La sucursal de origen y la de destino no pueden ser la misma.' });
    }

    const [products, fromBranch, toBranch] = await Promise.all([
      Product.find({ _id: { $in: items.map(i => i.productId) } }).lean(),
      fromBranchId ? PhysicalSpace.findById(fromBranchId).lean() : null,
      toBranchId ? PhysicalSpace.findById(toBranchId).lean() : null
    ]);
    if (products.length !== items.length) {
      return res.status(400).json({ message: 'Uno o más productos del pedido no existen.' });
    }
    const productById = (id) => products.find(p => String(p._id) === String(id));
    const productName = (id) => productById(id)?.name || 'Producto';

    // Lo decide el servidor: requiere validación si un ítem supera el umbral o si el producto requiere aprobación
    const requiresValidation = items.some(item => item.quantity > VALIDATION_THRESHOLD || !!productById(item.productId)?.requiresApproval);

    // Módulo 5: reservar stock en la sucursal origen. Cada reserva es atómica:
    // si un ítem no alcanza, se revierten las reservas ya hechas.
    if (fromBranchId) {
      for (const item of items) {
        const ok = await stock.reserveStock(fromBranchId, item.productId, item.quantity);
        if (!ok) {
          const record = await BranchStock.findOne({ branchId: fromBranchId, productId: item.productId }).lean();
          const total = record ? record.quantity : 0;
          const reservedQty = record ? (record.reservedQuantity || 0) : 0;
          const err = new Error(`Stock disponible insuficiente para "${productName(item.productId)}". Disponible: ${Math.max(0, total - reservedQty)} (Total: ${total}, Reservado: ${reservedQty}), Solicitado: ${item.quantity}`);
          err.status = 400;
          throw err;
        }
        reserved.push(item);
      }
    }

    const orderPayload = {
      solicitanteId: req.user.id,
      status: requiresValidation ? 'PENDIENTE_VALIDACION' : 'PENDIENTE',
      requiresValidation,
      fromBranchId: fromBranchId || null,
      toBranchId: toBranchId || null,
      notes: notes || null
    };

    let number = await nextSequence('order');
    let order;
    try {
      order = await Order.create({ ...orderPayload, number });
    } catch (err) {
      // Si el contador quedó desfasado respecto a pedidos existentes, se sincroniza y reintenta
      if (err && err.code === 11000) {
        const lastOrder = await Order.findOne({ number: { $type: 'number' } }).sort({ number: -1 }).select('number').lean();
        const syncedSeq = (lastOrder?.number || 0) + 1;
        await Counter.findOneAndUpdate({ _id: 'order' }, { $max: { seq: syncedSeq } }, { upsert: true });
        number = syncedSeq;
        order = await Order.create({ ...orderPayload, number });
      } else {
        throw err;
      }
    }

    const branchInfo = fromBranch && toBranch
      ? ` (${fromBranch.name} → ${toBranch.name})`
      : fromBranch ? ` (${fromBranch.name})` : toBranch ? ` (${toBranch.name})` : '';

    await Promise.all([
      OrderItem.insertMany(items.map(item => ({
        orderId: order._id,
        productId: item.productId,
        quantity: item.quantity
      }))),
      ActivityLog.create({
        userId: req.user.id,
        action: 'CREATE_ORDER',
        details: `Generó el pedido ${formatOrderCode(order)}. Estado: ${order.status}${branchInfo}`,
        orderId: order._id
      })
    ]);

    res.status(201).json({
      message: 'Orden generada',
      order: { ...order.toObject(), id: order._id.toString(), code: formatOrderCode(order) }
    });
  } catch (error) {
    // Revertir reservas parciales
    for (const item of reserved) {
      await stock.releaseReservation(req.body.fromBranchId, item.productId, item.quantity).catch(() => {});
    }
    res.status(error.status || 500).json({
      message: error.status ? error.message : 'Error creando la orden',
      ...(error.status ? {} : { error: error.message })
    });
  }
};

const formatOrder = (o, items) => {
  const fromObj = o.fromBranchId && typeof o.fromBranchId === 'object' ? { id: o.fromBranchId._id.toString(), name: o.fromBranchId.name, type: o.fromBranchId.type } : null;
  const toObj = o.toBranchId && typeof o.toBranchId === 'object' ? { id: o.toBranchId._id.toString(), name: o.toBranchId.name, type: o.toBranchId.type } : null;
  const solObj = o.solicitanteId && typeof o.solicitanteId === 'object' ? {
    id: toId(o.solicitanteId),
    username: o.solicitanteId.username,
    firstName: o.solicitanteId.firstName,
    lastName: o.solicitanteId.lastName,
    email: o.solicitanteId.email
  } : null;

  return {
    id: o._id.toString(),
    _id: o._id.toString(),
    number: o.number || null,
    code: formatOrderCode(o),
    status: o.status,
    requiresValidation: o.requiresValidation,
    solicitanteId: toId(o.solicitanteId),
    fromBranchId: toId(o.fromBranchId),
    toBranchId: toId(o.toBranchId),
    notes: o.notes,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    Solicitante: solObj,
    FromBranch: fromObj,
    ToBranch: toObj,
    SucursalOrigen: fromObj,
    SucursalDestino: toObj,
    OrderItems: items.map(it => ({
      id: it._id.toString(),
      _id: it._id.toString(),
      orderId: it.orderId.toString(),
      productId: toId(it.productId),
      quantity: it.quantity,
      dispatchedQuantity: it.dispatchedQuantity ?? null,
      preparedVariants: (it.preparedVariants || []).map(v => ({
        lotId: v.lotId ? v.lotId.toString() : null,
        lotNumber: v.lotNumber || null,
        expirationDate: v.expirationDate || null,
        brandId: v.brandId ? v.brandId.toString() : null,
        supplierId: v.supplierId ? v.supplierId.toString() : null,
        quantity: v.quantity
      })),
      Product: it.productId && typeof it.productId === 'object' ? { id: it.productId._id.toString(), name: it.productId.name } : null
    }))
  };
};

// Obtener pedidos. Filtros: status (uno o varios separados por coma), branchId,
// toBranchId. Con ?page= devuelve { items, total, page, pages }.
const getOrders = async (req, res) => {
  try {
    const query = {};
    const andConditions = [];

    if (req.user.role === 'Solicitante') {
      query.solicitanteId = req.user.id;
    } else if (req.user.role === 'Usuario Responsable') {
      const ownBranch = await effectiveBranchId(req.user);
      if (ownBranch) {
        andConditions.push({
          $or: [
            { fromBranchId: ownBranch },
            { toBranchId: ownBranch },
            { solicitanteId: req.user.id }
          ]
        });
      } else {
        query.solicitanteId = req.user.id;
      }
    }

    if (req.query.status) {
      const statuses = String(req.query.status).split(',').map(s => s.trim()).filter(Boolean);
      query.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }

    if (req.query.branchId) {
      andConditions.push({
        $or: [
          { fromBranchId: req.query.branchId },
          { toBranchId: req.query.branchId }
        ]
      });
    }
    if (req.query.toBranchId) {
      query.toBranchId = req.query.toBranchId;
    }
    if (andConditions.length === 1) {
      Object.assign(query, andConditions[0]);
    } else if (andConditions.length > 1) {
      query.$and = andConditions;
    }

    const paginated = req.query.page !== undefined;
    const { page, limit, skip } = parsePagination(req.query, 20);

    let cursor = Order.find(query)
      .populate('solicitanteId', 'username firstName lastName email')
      .populate('fromBranchId', 'name type')
      .populate('toBranchId', 'name type')
      .sort({ createdAt: -1 });
    if (paginated) cursor = cursor.skip(skip).limit(limit);

    const [rawOrders, total] = await Promise.all([
      cursor.lean(),
      paginated ? Order.countDocuments(query) : null
    ]);

    // Una sola consulta para los ítems de todos los pedidos (antes era una por pedido)
    const allItems = await OrderItem.find({ orderId: { $in: rawOrders.map(o => o._id) } })
      .populate('productId', 'name')
      .lean();
    const itemsByOrder = new Map();
    for (const item of allItems) {
      const key = item.orderId.toString();
      if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
      itemsByOrder.get(key).push(item);
    }

    const formatted = rawOrders.map(o => formatOrder(o, itemsByOrder.get(o._id.toString()) || []));

    if (paginated) {
      return res.json({ items: formatted, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
    }
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo pedidos', error: error.message });
  }
};

// T4.3 Aprobación del administrador (la ruta ya exige el rol Administrador)
const approveOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Cambio de estado atómico: solo se aprueba si sigue esperando validación
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: 'PENDIENTE_VALIDACION' },
      { $set: { status: 'PENDIENTE', validatorId: req.user.id } },
      { returnDocument: 'after' }
    );
    if (!order) {
      const exists = await Order.exists({ _id: orderId });
      return exists
        ? res.status(400).json({ message: 'La orden no requiere validación' })
        : res.status(404).json({ message: 'Orden no encontrada' });
    }

    await ActivityLog.create({
      userId: req.user.id,
      action: 'APPROVE_ORDER',
      details: `Administrador aprobó el pedido ${formatOrderCode(order)}`,
      orderId: order._id
    });

    res.json({ message: 'Orden aprobada y enviada al Despachante', order: { ...order.toObject(), id: order._id.toString() } });
  } catch (error) {
    res.status(500).json({ message: 'Error aprobando la orden', error: error.message });
  }
};

const canTransition = (order, status, user) => {
  const current = order.status;
  const role = user.role;
  if (status === 'EN_PREPARACION') {
    return current === 'PENDIENTE' && ['Despachante', 'Administrador'].includes(role);
  }
  if (status === 'DESPACHADO') {
    return ['PENDIENTE', 'EN_PREPARACION'].includes(current) && ['Despachante', 'Administrador'].includes(role);
  }
  if (status === 'ENTREGADO') {
    if (current !== 'DESPACHADO') return false;
    if (role === 'Administrador') return true;
    // El solicitante confirma sus propios pedidos; el responsable, los propios o los que llegan a su sucursal
    if (role === 'Solicitante') return String(order.solicitanteId) === String(user.id);
    if (role === 'Usuario Responsable') {
      return String(order.solicitanteId) === String(user.id) || (!!user.branchId && String(order.toBranchId) === String(user.branchId));
    }
    return false;
  }
  if (status === 'RECHAZADO') {
    // En la instancia de pendiente o revisión se puede rechazar un pedido y ahí termina su vida (el despachante no puede rechazar)
    return ['PENDIENTE_VALIDACION', 'PENDIENTE', 'EN_PREPARACION'].includes(current) && role === 'Administrador';
  }
  if (status === 'CANCELADO') {
    // Solo antes de empezar a prepararlo, y lo cancela quien lo pidió o el administrador
    return canEditOrder(order, user);
  }
  return false;
};

// Un pedido se puede modificar o cancelar mientras nadie empezó a prepararlo (todos menos el Despachante)
const EDITABLE_STATUSES = ['PENDIENTE_VALIDACION', 'PENDIENTE'];
const canEditOrder = (order, user) => EDITABLE_STATUSES.includes(order.status) && (
  user.role === 'Administrador'
  || user.role === 'Usuario Responsable'
  || String(order.solicitanteId) === String(user.id)
);

/**
 * PUT /api/orders/:orderId  { items: [{ productId, quantity }], notes? }
 * Agregar, quitar o cambiar productos de un pedido que todavía no se empezó a preparar.
 * Ajusta las reservas por la diferencia (si algo no alcanza, no cambia nada) y vuelve a
 * decidir si necesita la aprobación del administrador (más de 50 unidades de un producto).
 */
const updateOrder = async (req, res) => {
  const applied = [];
  try {
    const { orderId } = req.params;
    const current = await Order.findById(orderId).lean();
    if (!current) return res.status(404).json({ message: 'Orden no encontrada' });
    if (!canEditOrder(current, req.user)) {
      return res.status(400).json({ message: EDITABLE_STATUSES.includes(current.status)
        ? 'Solo quien hizo el pedido o el administrador pueden modificarlo.'
        : 'El pedido ya se empezó a preparar: no se puede modificar.' });
    }

    const items = mergeItems(req.body.items);
    const products = await Product.find({ _id: { $in: items.map(i => i.productId) } }).lean();
    if (products.length !== items.length) {
      return res.status(400).json({ message: 'Uno o más productos del pedido no existen.' });
    }
    const productById = (id) => products.find(p => String(p._id) === String(id));
    const productName = (id) => productById(id)?.name || 'Producto';

    // Diferencia por producto contra lo que ya estaba reservado
    const before = await OrderItem.find({ orderId }).lean();
    const oldQty = new Map(before.map(i => [String(i.productId), i.quantity]));
    const newQty = new Map(items.map(i => [String(i.productId), i.quantity]));
    const deltas = [...new Set([...oldQty.keys(), ...newQty.keys()])]
      .map(productId => ({ productId, delta: (newQty.get(productId) || 0) - (oldQty.get(productId) || 0) }))
      .filter(d => d.delta !== 0);

    if (current.fromBranchId) {
      // Primero se reservan los aumentos (atómico); si alguno no alcanza se deshace todo
      for (const d of deltas.filter(x => x.delta > 0)) {
        const ok = await stock.reserveStock(current.fromBranchId, d.productId, d.delta);
        if (!ok) {
          const record = await BranchStock.findOne({ branchId: current.fromBranchId, productId: d.productId }).lean();
          const available = record ? Math.max(0, record.quantity - (record.reservedQuantity || 0)) : 0;
          const err = new Error(`No hay stock suficiente de "${productName(d.productId)}" para sumar ${d.delta} u. Disponible: ${available}.`);
          err.status = 400;
          throw err;
        }
        applied.push(d);
      }
    }

    const requiresValidation = items.some(item => item.quantity > VALIDATION_THRESHOLD || !!productById(item.productId)?.requiresApproval);
    const newStatus = requiresValidation ? 'PENDIENTE_VALIDACION' : 'PENDIENTE';
    // Atómico: si mientras tanto se empezó a preparar, no se toca
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: current.status },
      { $set: { status: newStatus, requiresValidation, ...(req.body.notes !== undefined ? { notes: req.body.notes || null } : {}) } },
      { returnDocument: 'after' }
    );
    if (!order) {
      const err = new Error('El pedido cambió mientras se modificaba (puede que ya se esté preparando). Actualizá la pantalla.');
      err.status = 409;
      throw err;
    }

    // Se liberan las reservas de lo que se quitó o bajó, y se reemplazan los ítems
    if (current.fromBranchId) {
      for (const d of deltas.filter(x => x.delta < 0)) {
        await stock.releaseReservation(current.fromBranchId, d.productId, -d.delta);
      }
    }
    await OrderItem.deleteMany({ orderId });
    await OrderItem.insertMany(items.map(item => ({ orderId, productId: item.productId, quantity: item.quantity })));

    const changes = deltas.map(d => {
      const from = oldQty.get(d.productId) || 0;
      const to = newQty.get(d.productId) || 0;
      return from === 0 ? `agregó ${to} u. de "${productName(d.productId)}"`
        : to === 0 ? `quitó "${productName(d.productId) || 'producto'}"`
          : `"${productName(d.productId)}" ${from} → ${to}`;
    });
    if (newStatus !== current.status) {
      changes.push(newStatus === 'PENDIENTE_VALIDACION' ? 'ahora necesita aprobación del administrador' : 'ya no necesita aprobación');
    }
    await ActivityLog.create({
      userId: req.user.id,
      action: 'UPDATE_ORDER',
      details: `Modificó el pedido ${formatOrderCode(order)}: ${changes.join(', ') || 'sin cambios en los productos'}`,
      orderId: order._id
    });

    res.json({ message: 'Pedido modificado', changes, order: { ...order.toObject(), id: order._id.toString(), code: formatOrderCode(order) } });
  } catch (error) {
    // Se devuelven las reservas que se habían tomado
    const fromBranchId = (await Order.findById(req.params.orderId).select('fromBranchId').lean().catch(() => null))?.fromBranchId;
    for (const d of applied) {
      if (fromBranchId) await stock.releaseReservation(fromBranchId, d.productId, d.delta).catch(() => {});
    }
    res.status(error.status || 500).json({
      message: error.status ? error.message : 'Error modificando el pedido',
      ...(error.status ? {} : { error: error.message })
    });
  }
};

/**
 * POST /api/orders/:orderId/prepare
 * El Administrador o Despachante prepara un pedido seleccionando la cantidad a enviar
 * de cada variante (lote o sin lote) de cada artículo solicitado, nunca más de lo solicitado.
 * Al confirmar, el pedido pasa a DESPACHADO. El stock recién se descuenta del origen y se suma
 * al destino cuando se confirma la recepción (ENTREGADO).
 */
const prepareOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const current = await Order.findById(orderId).lean();
    if (!current) return res.status(404).json({ message: 'Orden no encontrada' });
    if (!['PENDIENTE', 'EN_PREPARACION'].includes(current.status)) {
      return res.status(400).json({ message: 'Solo se pueden preparar pedidos que están en estado Pendiente.' });
    }

    const orderItems = await OrderItem.find({ orderId }).populate('productId', 'name').lean();
    if (!orderItems.length) {
      return res.status(400).json({ message: 'El pedido no tiene artículos.' });
    }

    const inputByProduct = new Map();
    for (const item of req.body.items || []) {
      inputByProduct.set(String(item.productId), Array.isArray(item.variants) ? item.variants : []);
    }

    // Buscar todos los lotes involucrados en la sucursal de origen
    const allLotIds = [];
    for (const variants of inputByProduct.values()) {
      for (const v of variants) {
        if (v.lotId && (parseInt(v.quantity, 10) || 0) > 0) allLotIds.push(String(v.lotId));
      }
    }
    const lotDocs = (allLotIds.length && current.fromBranchId)
      ? await StockEntry.find({ _id: { $in: allLotIds }, branchId: current.fromBranchId }).lean()
      : [];
    const lotsById = new Map(lotDocs.map(l => [l._id.toString(), l]));

    const updates = [];
    let grandTotalDispatched = 0;

    for (const orderItem of orderItems) {
      const prodId = String(orderItem.productId?._id || orderItem.productId);
      const prodName = orderItem.productId?.name || 'Artículo';
      const requestedQty = orderItem.quantity;
      const rawVariants = inputByProduct.get(prodId) || [];

      const preparedVariants = [];
      let totalForProduct = 0;
      const seenLots = new Set();

      for (const v of rawVariants) {
        const qty = parseInt(v.quantity, 10) || 0;
        if (qty <= 0) continue;
        const lotKey = v.lotId ? String(v.lotId) : '__NO_LOT__';
        if (seenLots.has(lotKey)) {
          return res.status(400).json({ message: `Hay una variante repetida en "${prodName}".` });
        }
        seenLots.add(lotKey);

        if (v.lotId) {
          const lot = lotsById.get(String(v.lotId));
          if (!lot || String(lot.productId) !== prodId) {
            return res.status(400).json({ message: `El lote indicado para "${prodName}" no pertenece a la sucursal de origen.` });
          }
          if (qty > (lot.remaining || 0)) {
            return res.status(400).json({ message: `El lote ${lot.lotNumber} de "${prodName}" tiene ${lot.remaining || 0} u. disponibles; no se pueden enviar ${qty}.` });
          }
          preparedVariants.push({
            lotId: lot._id,
            lotNumber: lot.lotNumber,
            expirationDate: lot.expirationDate,
            brandId: lot.brandId || null,
            supplierId: lot.supplierId || null,
            quantity: qty
          });
        } else {
          preparedVariants.push({
            lotId: null,
            lotNumber: null,
            expirationDate: null,
            brandId: null,
            supplierId: null,
            quantity: qty
          });
        }
        totalForProduct += qty;
      }

      if (totalForProduct > requestedQty) {
        return res.status(400).json({
          message: `No se pueden enviar más unidades de "${prodName}" (${totalForProduct}) que las solicitadas (${requestedQty}).`
        });
      }

      grandTotalDispatched += totalForProduct;
      updates.push({
        orderItem,
        prodId,
        prodName,
        requestedQty,
        dispatchedQuantity: totalForProduct,
        preparedVariants
      });
    }

    if (grandTotalDispatched <= 0) {
      return res.status(400).json({ message: 'Seleccioná al menos 1 unidad para enviar en el pedido.' });
    }

    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: current.status },
      { $set: { status: 'DESPACHADO' } },
      { returnDocument: 'after' }
    );
    if (!order) {
      return res.status(409).json({ message: 'El pedido fue modificado por otro usuario. Actualizá la pantalla.' });
    }

    for (const u of updates) {
      await OrderItem.updateOne(
        { _id: u.orderItem._id },
        { $set: { dispatchedQuantity: u.dispatchedQuantity, preparedVariants: u.preparedVariants } }
      );
      // Si se envía menos que lo solicitado originalmente, se libera la diferencia de la reserva en origen
      const unfulfilled = u.requestedQty - u.dispatchedQuantity;
      if (unfulfilled > 0 && current.fromBranchId) {
        await stock.releaseReservation(current.fromBranchId, u.prodId, unfulfilled);
      }
    }

    const code = formatOrderCode(order);
    const summaryParts = updates.map(u => {
      const varDesc = u.preparedVariants.map(v => `${v.lotNumber ? `Lote ${v.lotNumber}` : 'Sin lote'}: ${v.quantity}`).join(', ');
      return `"${u.prodName}" ${u.dispatchedQuantity}/${u.requestedQty} u.${varDesc ? ` (${varDesc})` : ''}`;
    });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'PREPARE_ORDER',
      details: `Preparó y despachó el pedido ${code}: ${summaryParts.join(' · ')}`,
      orderId: order._id
    });

    res.json({
      message: 'Pedido preparado y despachado',
      order: { ...order.toObject(), id: order._id.toString(), code }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error preparando el pedido', error: error.message });
  }
};

// T5.2 y T5.3: Actualizar el estado del pedido (Máquina de Estados)
// Al llegar a ENTREGADO: mueve el stock automáticamente entre sucursales
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const current = await Order.findById(orderId);
    if (!current) return res.status(404).json({ message: 'Orden no encontrada' });

    if (!canTransition(current, status, req.user)) {
      return res.status(400).json({
        message: `Transición de estado inválida de ${current.status} a ${status} para el rol ${req.user.role}`
      });
    }

    // Cambio atómico: si otro usuario cambió el estado mientras tanto, no se aplica dos veces
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: current.status },
      { $set: { status } },
      { returnDocument: 'after' }
    );
    if (!order) {
      return res.status(409).json({ message: 'El pedido fue modificado por otro usuario. Actualizá la pantalla.' });
    }

    const code = formatOrderCode(order);
    const orderItems = await OrderItem.find({ orderId }).populate('productId', 'name').lean();

    await ActivityLog.create({
      userId: req.user.id,
      action: 'UPDATE_STATUS',
      details: `Usuario ${req.user.username} (${req.user.role}) cambió el estado del pedido ${code} a ${status}`,
      orderId: order._id
    });

    const [fromSpace, toSpace] = await Promise.all([
      order.fromBranchId ? PhysicalSpace.findById(order.fromBranchId) : null,
      order.toBranchId ? PhysicalSpace.findById(order.toBranchId) : null
    ]);
    const fromName = fromSpace ? fromSpace.name : 'Central';
    const toName = toSpace ? toSpace.name : 'General';

    // Módulo 5: liberar la reserva si el pedido es RECHAZADO o CANCELADO
    if (['RECHAZADO', 'CANCELADO'].includes(status) && order.fromBranchId) {
      for (const item of orderItems) {
        if (!item.productId) continue;
        const reservedToRelease = item.dispatchedQuantity !== null && item.dispatchedQuantity !== undefined
          ? item.dispatchedQuantity
          : item.quantity;
        if (reservedToRelease > 0) {
          await stock.releaseReservation(order.fromBranchId, item.productId._id, reservedToRelease);
        }
      }
      await ActivityLog.create({
        userId: req.user.id,
        action: 'RESERVATION_RELEASED',
        details: `Reserva liberada por ${status === 'CANCELADO' ? 'cancelación' : 'rechazo'} del pedido ${code} en sucursal "${fromName}"`,
        orderId: order._id
      });
    }

    // Movimiento automático de stock al entregar (confirmación de recepción)
    const discrepancies = [];
    if (status === 'ENTREGADO' && (order.fromBranchId || order.toBranchId)) {
      for (const item of orderItems) {
        if (!item.productId) continue;
        const prodId = item.productId._id;
        const productName = item.productId.name;
        const qty = item.dispatchedQuantity !== null && item.dispatchedQuantity !== undefined
          ? item.dispatchedQuantity
          : item.quantity;
        if (qty <= 0) continue;
        let movedLots = [];

        if (order.fromBranchId) {
          const { missing } = await stock.consumeReservedStock(order.fromBranchId, prodId, qty);
          movedLots = await stock.consumePreparedVariants(order.fromBranchId, prodId, item.preparedVariants, qty);

          await stock.recordMovement({
            type: 'TRANSFERENCIA_SALIDA',
            branchId: order.fromBranchId,
            productId: prodId,
            quantity: -qty,
            lotNumber: movedLots.map(l => l.lotNumber).filter(Boolean).join(', ') || null,
            orderId: order._id,
            reason: `Entrega del pedido ${code} a "${toName}"`,
            userId: req.user.id
          });

          // El sistema tenía menos stock del que se despachó: se registra, no se oculta
          if (missing > 0) {
            discrepancies.push({ productName, missing });
            await stock.recordMovement({
              type: 'DISCREPANCIA',
              branchId: order.fromBranchId,
              productId: prodId,
              quantity: missing,
              orderId: order._id,
              reason: `Se despacharon ${qty} unidades pero el sistema registraba ${qty - missing}. Faltante de inventario: ${missing}`,
              userId: req.user.id
            });
            await ActivityLog.create({
              userId: req.user.id,
              action: 'STOCK_DISCREPANCY',
              details: `Discrepancia en sucursal "${fromName}" al entregar el pedido ${code}: faltaban ${missing} unidades de "${productName}" en el sistema`,
              orderId: order._id
            });
          }
        }

        if (order.toBranchId) {
          await stock.increaseStock(order.toBranchId, prodId, qty);
          // Los lotes viajan con la mercadería para conservar el control de vencimientos
          for (const lot of movedLots) {
            await stock.createLot({ ...lot, productId: prodId, branchId: order.toBranchId, registeredBy: req.user.id });
          }
          await stock.recordMovement({
            type: 'TRANSFERENCIA_ENTRADA',
            branchId: order.toBranchId,
            productId: prodId,
            quantity: qty,
            lotNumber: movedLots.map(l => l.lotNumber).filter(Boolean).join(', ') || null,
            orderId: order._id,
            reason: `Recepción del pedido ${code} desde "${fromName}"`,
            userId: req.user.id
          });
        }

        await ActivityLog.create({
          userId: req.user.id,
          action: 'STOCK_MOVEMENT',
          details: `Movimiento por entrega del pedido ${code}: -${qty} en sucursal "${fromName}" → +${qty} en sucursal "${toName}" — Producto: "${productName}"`,
          orderId: order._id
        });
      }
    }

    res.json({
      message: 'Estado del pedido actualizado',
      order: { ...order.toObject(), id: order._id.toString(), code },
      discrepancies
    });
  } catch (error) {
    res.status(500).json({ message: 'Error actualizando estado del pedido', error: error.message });
  }
};

// T5.4: Trazabilidad e historial de un pedido específico
const getOrderHistory = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (req.user.role === 'Solicitante') {
      const own = await Order.exists({ _id: orderId, solicitanteId: req.user.id });
      if (!own) return res.status(403).json({ message: 'Solo podés ver el historial de tus pedidos.' });
    }

    const history = await ActivityLog.find({ orderId })
      .populate('userId', 'username role firstName lastName')
      .sort({ createdAt: 1 })
      .lean();

    const formatted = history.map(h => ({
      id: h._id.toString(),
      _id: h._id.toString(),
      action: h.action,
      details: h.details,
      timestamp: h.timestamp || h.createdAt,
      createdAt: h.createdAt,
      User: h.userId && typeof h.userId === 'object' ? {
        username: h.userId.username,
        firstName: h.userId.firstName,
        lastName: h.userId.lastName,
        role: h.userId.role
      } : null
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo historial del pedido', error: error.message });
  }
};

module.exports = {
  createOrder,
  getOrders,
  approveOrder,
  updateOrder,
  prepareOrder,
  updateOrderStatus,
  getOrderHistory
};
