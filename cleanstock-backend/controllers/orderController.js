const jwt = require('jsonwebtoken');
const { Order, OrderItem, Product, Category, ActivityLog, User } = require('../models');
const { JWT_SECRET } = require('../middlewares/authMiddleware');

// T4.1 Catálogo interactivo - Búsqueda y filtros (se exponen los productos)
// (Usaremos getProducts del inventoryController, pero podríamos agregar endpoints específicos aquí si hay lógica extra)

// T4.2 Crear una Orden de Pedido a partir de un carrito
const createOrder = async (req, res) => {
  try {
    const { items, requiresValidation } = req.body; 
    // items: [{ productId, quantity }]
    
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'El carrito está vacío' });
    }

    const order = await Order.create({
      solicitanteId: req.user.id,
      status: requiresValidation ? 'PENDIENTE_VALIDACION' : 'PENDIENTE',
      requiresValidation: requiresValidation || false
    });

    const orderItemsData = items.map(item => ({
      orderId: order.id,
      productId: item.productId,
      quantity: item.quantity
    }));

    await OrderItem.bulkCreate(orderItemsData);

    await ActivityLog.create({
      userId: req.user.id,
      action: 'CREATE_ORDER',
      details: `Solicitante generó la orden ${order.id}. Estado: ${order.status}`,
      orderId: order.id
    });

    res.status(201).json({ message: 'Orden generada', order });
  } catch (error) {
    res.status(500).json({ message: 'Error creando la orden', error: error.message });
  }
};

// Obtener pedidos (para el solicitante o el despachante)
const getOrders = async (req, res) => {
  try {
    const query = {};
    // Si es Solicitante, solo ve sus pedidos. Si es Despachante/Admin/Usuario Responsable, los ve todos o filtra.
    if (req.user.role === 'Solicitante') {
      query.solicitanteId = req.user.id;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    const orders = await Order.findAll({
      where: query,
      include: [
        { model: User, as: 'Solicitante', attributes: ['username'] },
        { model: OrderItem, include: [{ model: Product, attributes: ['name'] }] }
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
    
    // Verificar token específico
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
      userId: decoded.adminId, // El admin que validó
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
const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'El estado es requerido' });
    }

    const order = await Order.findByPk(orderId);
    if (!order) return res.status(404).json({ message: 'Orden no encontrada' });

    const currentStatus = order.status;
    const userRole = req.user.role;

    let allowed = false;

    // Transiciones válidas:
    // PENDIENTE -> EN_PREPARACION (Despachante, Administrador)
    // EN_PREPARACION -> DESPACHADO (Despachante, Administrador)
    // DESPACHADO -> ENTREGADO (Solicitante, Usuario Responsable, Administrador)
    // Cualquier estado previo a ENTREGADO -> RECHAZADO (Administrador)

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
