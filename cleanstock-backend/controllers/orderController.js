const jwt = require('jsonwebtoken');
const { Order, OrderItem, Product, ActivityLog, PhysicalSpace, BranchStock, nextSequence } = require('../models');
const { JWT_SECRET } = require('../middlewares/authMiddleware');
const stock = require('../services/stockService');
const { toId, formatOrderCode, parsePagination } = require('../utils/format');

// Une ítems repetidos del mismo producto en uno solo
const mergeItems = (items) => {
  const merged = new Map();
  for (const item of items) {
    const key = String(item.productId);
    merged.set(key, (merged.get(key) || 0) + parseInt(item.quantity, 10));
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
};

// Un pedido con más de esta cantidad de un mismo producto requiere aprobación del administrador
const VALIDATION_THRESHOLD = 50;

// T4.2 Crear una Orden de Pedido a partir de un carrito
const createOrder = async (req, res) => {
  const reserved = [];
  try {
    const { fromBranchId, toBranchId, notes } = req.body;
    const items = mergeItems(req.body.items);
    // Lo decide el servidor: no se confía en lo que mande el cliente
    const requiresValidation = items.some(item => item.quantity > VALIDATION_THRESHOLD);

    if (fromBranchId && toBranchId && String(fromBranchId) === String(toBranchId)) {
      return res.status(400).json({ message: 'La sucursal de origen y la de destino no pueden ser la misma.' });
    }

    const products = await Product.find({ _id: { $in: items.map(i => i.productId) } }).lean();
    if (products.length !== items.length) {
      return res.status(400).json({ message: 'Uno o más productos del pedido no existen.' });
    }
    const productName = (id) => products.find(p => String(p._id) === String(id))?.name || 'Producto';

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

    const number = await nextSequence('order');
    const order = await Order.create({
      number,
      solicitanteId: req.user.id,
      status: requiresValidation ? 'PENDIENTE_VALIDACION' : 'PENDIENTE',
      requiresValidation,
      fromBranchId: fromBranchId || null,
      toBranchId: toBranchId || null,
      notes: notes || null
    });

    await OrderItem.insertMany(items.map(item => ({
      orderId: order._id,
      productId: item.productId,
      quantity: item.quantity
    })));

    const [fromBranch, toBranch] = await Promise.all([
      fromBranchId ? PhysicalSpace.findById(fromBranchId) : null,
      toBranchId ? PhysicalSpace.findById(toBranchId) : null
    ]);
    const branchInfo = fromBranch && toBranch
      ? ` (${fromBranch.name} → ${toBranch.name})`
      : fromBranch ? ` (${fromBranch.name})` : toBranch ? ` (${toBranch.name})` : '';

    await ActivityLog.create({
      userId: req.user.id,
      action: 'CREATE_ORDER',
      details: `Generó el pedido ${formatOrderCode(order)}. Estado: ${order.status}${branchInfo}`,
      orderId: order._id
    });

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
      Product: it.productId && typeof it.productId === 'object' ? { id: it.productId._id.toString(), name: it.productId.name } : null
    }))
  };
};

// Obtener pedidos. Filtros: status (uno o varios separados por coma), branchId,
// toBranchId. Con ?page= devuelve { items, total, page, pages }.
const getOrders = async (req, res) => {
  try {
    const query = {};

    if (req.user.role === 'Solicitante') {
      query.solicitanteId = req.user.id;
    }

    if (req.query.status) {
      const statuses = String(req.query.status).split(',').map(s => s.trim()).filter(Boolean);
      query.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }

    if (req.query.branchId) {
      query.$or = [
        { fromBranchId: req.query.branchId },
        { toBranchId: req.query.branchId }
      ];
    }
    if (req.query.toBranchId) {
      query.toBranchId = req.query.toBranchId;
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

// T4.3 Flujo de Aprobación de Administrador (usando el validation token)
const approveOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { validationToken } = req.body;

    let decoded;
    try {
      decoded = jwt.verify(validationToken, JWT_SECRET);
      if (decoded.type !== 'validation_token' || decoded.orderId !== orderId) {
        throw new Error('Token no válido para esta orden');
      }
    } catch (err) {
      return res.status(403).json({ message: 'Token de validación inválido o expirado' });
    }

    // Cambio de estado atómico: solo se aprueba si sigue esperando validación
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: 'PENDIENTE_VALIDACION' },
      { $set: { status: 'PENDIENTE', validatorId: decoded.adminId } },
      { returnDocument: 'after' }
    );
    if (!order) {
      const exists = await Order.exists({ _id: orderId });
      return exists
        ? res.status(400).json({ message: 'La orden no requiere validación' })
        : res.status(404).json({ message: 'Orden no encontrada' });
    }

    await ActivityLog.create({
      userId: decoded.adminId,
      action: 'APPROVE_ORDER',
      details: `Administrador aprobó el pedido ${formatOrderCode(order)} mediante token`,
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
    return current === 'EN_PREPARACION' && ['Despachante', 'Administrador'].includes(role);
  }
  if (status === 'ENTREGADO') {
    if (current !== 'DESPACHADO') return false;
    if (role === 'Administrador') return true;
    // El solicitante confirma sus propios pedidos; el responsable, los que llegan a su sucursal
    if (role === 'Solicitante') return String(order.solicitanteId) === String(user.id);
    if (role === 'Usuario Responsable') return !!user.branchId && String(order.toBranchId) === String(user.branchId);
    return false;
  }
  if (status === 'RECHAZADO') {
    return !['ENTREGADO', 'RECHAZADO'].includes(current) && role === 'Administrador';
  }
  return false;
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

    // Módulo 5: liberar la reserva si el pedido es RECHAZADO
    if (status === 'RECHAZADO' && order.fromBranchId) {
      for (const item of orderItems) {
        if (!item.productId) continue;
        await stock.releaseReservation(order.fromBranchId, item.productId._id, item.quantity);
      }
      await ActivityLog.create({
        userId: req.user.id,
        action: 'RESERVATION_RELEASED',
        details: `Reserva liberada por rechazo del pedido ${code} en sucursal "${fromName}"`,
        orderId: order._id
      });
    }

    // Movimiento automático de stock al entregar
    const discrepancies = [];
    if (status === 'ENTREGADO' && (order.fromBranchId || order.toBranchId)) {
      for (const item of orderItems) {
        if (!item.productId) continue;
        const prodId = item.productId._id;
        const productName = item.productId.name;
        const qty = item.quantity;
        let movedLots = [];

        if (order.fromBranchId) {
          const { missing } = await stock.consumeReservedStock(order.fromBranchId, prodId, qty);
          movedLots = await stock.consumeLots(order.fromBranchId, prodId, qty);

          await stock.recordMovement({
            type: 'TRANSFERENCIA_SALIDA',
            branchId: order.fromBranchId,
            productId: prodId,
            quantity: -qty,
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
            lotNumber: movedLots.map(l => l.lotNumber).join(', ') || null,
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
  updateOrderStatus,
  getOrderHistory
};
