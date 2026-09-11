const jwt = require('jsonwebtoken');
const { Order, OrderItem, Product, Category, ActivityLog, User, PhysicalSpace, BranchStock } = require('../models');
const { JWT_SECRET } = require('../middlewares/authMiddleware');

// T4.2 Crear una Orden de Pedido a partir de un carrito
const createOrder = async (req, res) => {
  try {
    const { items, requiresValidation, fromBranchId, toBranchId, notes } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'El carrito está vacío' });
    }

    // Módulo 5: Validar stock DISPONIBLE (total - reservado) si hay sucursal origen
    if (fromBranchId) {
      for (const item of items) {
        const stockRecord = await BranchStock.findOne({
          where: { branchId: fromBranchId, productId: item.productId }
        });
        const total = stockRecord ? stockRecord.quantity : 0;
        const reserved = stockRecord ? (stockRecord.reservedQuantity || 0) : 0;
        const available = total - reserved;
        if (available < item.quantity) {
          const product = await Product.findByPk(item.productId);
          return res.status(400).json({
            message: `Stock disponible insuficiente para "${product?.name || item.productId}". Disponible: ${available} (Total: ${total}, Reservado: ${reserved}), Solicitado: ${item.quantity}`
          });
        }
      }
    }

    const order = await Order.create({
      solicitanteId: req.user.id,
      status: requiresValidation ? 'PENDIENTE_VALIDACION' : 'PENDIENTE',
      requiresValidation: requiresValidation || false,
      fromBranchId: fromBranchId || null,
      toBranchId: toBranchId || null,
      notes: notes || null
    });

    const orderItemsData = items.map(item => ({
      orderId: order.id,
      productId: item.productId,
      quantity: item.quantity
    }));

    await OrderItem.bulkCreate(orderItemsData);

    // Módulo 5: Reservar stock en la sucursal origen
    if (fromBranchId) {
      for (const item of items) {
        const [stockRecord] = await BranchStock.findOrCreate({
          where: { branchId: fromBranchId, productId: item.productId },
          defaults: { quantity: 0, reservedQuantity: 0 }
        });
        stockRecord.reservedQuantity = (stockRecord.reservedQuantity || 0) + item.quantity;
        await stockRecord.save();
      }
    }

    const fromBranch = fromBranchId ? await PhysicalSpace.findByPk(fromBranchId) : null;
    const toBranch   = toBranchId   ? await PhysicalSpace.findByPk(toBranchId)   : null;
    const branchInfo = fromBranch && toBranch
      ? ` (${fromBranch.name} → ${toBranch.name})`
      : '';

    await ActivityLog.create({
      userId: req.user.id,
      action: 'CREATE_ORDER',
      details: `Generó la orden ${order.id}. Estado: ${order.status}${branchInfo}`,
      orderId: order.id
    });

    res.status(201).json({ message: 'Orden generada', order });
  } catch (error) {
    res.status(500).json({ message: 'Error creando la orden', error: error.message });
  }
};


// Obtener pedidos
const getOrders = async (req, res) => {
  try {
    const query = {};

    if (req.user.role === 'Solicitante') {
      query.solicitanteId = req.user.id;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filtrar por sucursal si se especifica
    if (req.query.branchId) {
      const { Op } = require('sequelize');
      query[Op.or] = [
        { fromBranchId: req.query.branchId },
        { toBranchId: req.query.branchId }
      ];
    }

    const orders = await Order.findAll({
      where: query,
      include: [
        { model: User, as: 'Solicitante', attributes: ['username'] },
        { model: OrderItem, include: [{ model: Product, attributes: ['name'] }] },
        { model: PhysicalSpace, as: 'SucursalOrigen', attributes: ['id', 'name', 'type'] },
        { model: PhysicalSpace, as: 'SucursalDestino', attributes: ['id', 'name', 'type'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo pedidos', error: error.message });
  }
};

// T4.3 Flujo de Aprobación de Administrador (usando el validation token)
const approveOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { validationToken } = req.body;

    if (!validationToken) {
      return res.status(403).json({ message: 'Se requiere un token de validación' });
    }

    let decoded;
    try {
      decoded = jwt.verify(validationToken, JWT_SECRET);
      if (decoded.type !== 'validation_token' || decoded.orderId !== orderId) {
        throw new Error('Token no válido para esta orden');
      }
    } catch (err) {
      return res.status(403).json({ message: 'Token de validación inválido o expirado' });
    }

    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ message: 'Orden no encontrada' });
    if (order.status !== 'PENDIENTE_VALIDACION') return res.status(400).json({ message: 'La orden no requiere validación' });

    order.status = 'PENDIENTE';
    order.validatorId = decoded.adminId;
    await order.save();

    await ActivityLog.create({
      userId: decoded.adminId,
      action: 'APPROVE_ORDER',
      details: `Administrador aprobó la orden ${order.id} mediante token`,
      orderId: order.id
    });

    res.json({ message: 'Orden aprobada y enviada al Despachante', order });
  } catch (error) {
    res.status(500).json({ message: 'Error aprobando la orden', error: error.message });
  }
};

// T5.2 y T5.3: Actualizar el estado del pedido (Máquina de Estados)
// Al llegar a ENTREGADO: mueve el stock automáticamente entre sucursales
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'El estado es requerido' });
    }

    const order = await Order.findByPk(orderId, {
      include: [{ model: OrderItem, include: [{ model: Product }] }]
    });
    if (!order) return res.status(404).json({ message: 'Orden no encontrada' });

    const currentStatus = order.status;
    const userRole = req.user.role;

    let allowed = false;

    if (status === 'EN_PREPARACION') {
      if (currentStatus === 'PENDIENTE' && (userRole === 'Despachante' || userRole === 'Administrador')) {
        allowed = true;
      }
    } else if (status === 'DESPACHADO') {
      if (currentStatus === 'EN_PREPARACION' && (userRole === 'Despachante' || userRole === 'Administrador')) {
        allowed = true;
      }
    } else if (status === 'ENTREGADO') {
      if (currentStatus === 'DESPACHADO' && (userRole === 'Solicitante' || userRole === 'Usuario Responsable' || userRole === 'Administrador')) {
        allowed = true;
      }
    } else if (status === 'RECHAZADO') {
      if (currentStatus !== 'ENTREGADO' && currentStatus !== 'RECHAZADO' && userRole === 'Administrador') {
        allowed = true;
      }
    }

    if (!allowed) {
      return res.status(400).json({
        message: `Transición de estado inválida de ${currentStatus} a ${status} para el rol ${userRole}`
      });
    }

    order.status = status;
    await order.save();

    await ActivityLog.create({
      userId: req.user.id,
      action: 'UPDATE_STATUS',
      details: `Usuario ${req.user.username} (${userRole}) cambió el estado de la orden a ${status}`,
      orderId: order.id
    });

    // ─── Módulo 5: Liberar reserva si el pedido es RECHAZADO ─────────────────
    if (status === 'RECHAZADO' && order.fromBranchId) {
      for (const item of order.OrderItems) {
        const stockRecord = await BranchStock.findOne({
          where: { branchId: order.fromBranchId, productId: item.productId }
        });
        if (stockRecord) {
          stockRecord.reservedQuantity = Math.max(0, (stockRecord.reservedQuantity || 0) - item.quantity);
          await stockRecord.save();
        }
      }
      await ActivityLog.create({
        userId: req.user.id,
        action: 'RESERVATION_RELEASED',
        details: `Reserva liberada por rechazo de orden ${order.id} en sucursal ${order.fromBranchId}`,
        orderId: order.id
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ─── MOVIMIENTO AUTOMÁTICO DE STOCK al entregar ──────────────────────────
    if (status === 'ENTREGADO' && (order.fromBranchId || order.toBranchId)) {
      for (const item of order.OrderItems) {
        const qty = item.quantity;
        const productName = item.Product?.name || item.productId;

        // Restar del origen y liberar reserva
        if (order.fromBranchId) {
          let [stockFrom] = await BranchStock.findOrCreate({
            where: { branchId: order.fromBranchId, productId: item.productId },
            defaults: { quantity: 0, reservedQuantity: 0 }
          });
          stockFrom.quantity = Math.max(0, stockFrom.quantity - qty);
          stockFrom.reservedQuantity = Math.max(0, (stockFrom.reservedQuantity || 0) - qty);
          await stockFrom.save();
        }

        // Sumar en destino
        if (order.toBranchId) {
          let [stockTo] = await BranchStock.findOrCreate({
            where: { branchId: order.toBranchId, productId: item.productId },
            defaults: { quantity: 0, reservedQuantity: 0 }
          });
          stockTo.quantity = stockTo.quantity + qty;
          await stockTo.save();
        }

        await ActivityLog.create({
          userId: req.user.id,
          action: 'STOCK_MOVEMENT',
          details: `Movimiento por entrega de orden ${order.id}: -${qty} en sucursal ${order.fromBranchId || 'N/A'} → +${qty} en sucursal ${order.toBranchId || 'N/A'} — Producto: "${productName}"`,
          orderId: order.id
        });
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    res.json({ message: 'Estado del pedido actualizado', order });
  } catch (error) {
    res.status(500).json({ message: 'Error actualizando estado del pedido', error: error.message });
  }
};

// T5.4: Trazabilidad e historial de un pedido específico
const getOrderHistory = async (req, res) => {
  try {
    const { orderId } = req.params;
    const history = await ActivityLog.findAll({
      where: { orderId },
      include: [{ model: User, attributes: ['username', 'role'] }],
      order: [['createdAt', 'ASC']]
    });
    res.json(history);
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

