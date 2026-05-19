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
      details: `Solicitante generó la orden ${order.id}. Estado: ${order.status}`
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
    // Si es Solicitante, solo ve sus pedidos. Si es Despachante/Admin, los ve todos o filtra por estado.
    if (req.user.role === 'Solicitante') {
      query.solicitanteId = req.user.id;
    }

    const orders = await Order.findAll({
      where: query,
      include: [
        { model: User, as: 'Solicitante', attributes: ['username'] },
        { model: OrderItem, include: [{ model: Product, attributes: ['name'] }] }
      ]
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
      details: `Administrador aprobó la orden ${order.id} mediante token`
    });
    
    res.json({ message: 'Orden aprobada y enviada al Despachante', order });
  } catch (error) {
    res.status(500).json({ message: 'Error aprobando la orden', error: error.message });
  }
};

module.exports = {
  createOrder,
  getOrders,
  approveOrder
};
