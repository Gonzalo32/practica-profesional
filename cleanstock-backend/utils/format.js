// Helpers compartidos por los controladores

const toId = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value._id) return value._id.toString();
  return value.toString();
};

// PED-0001 para pedidos nuevos; los anteriores al número correlativo conservan su código corto
const formatOrderCode = (order) => {
  if (order.number) return `PED-${String(order.number).padStart(4, '0')}`;
  return `#${order._id.toString().substring(0, 8).toUpperCase()}`;
};

const formatPurchaseOrderCode = (po) => `OC-${String(po.number).padStart(4, '0')}`;

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Paginación opcional: ?page=1&limit=20. limit=0 devuelve todo (con tope) para exportar.
const parsePagination = (query, defaultLimit = 20, maxLimit = 5000) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  let limit = query.limit === undefined ? defaultLimit : parseInt(query.limit, 10);
  if (Number.isNaN(limit) || limit < 0) limit = defaultLimit;
  if (limit === 0 || limit > maxLimit) limit = maxLimit;
  return { page, limit, skip: (page - 1) * limit };
};

const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

module.exports = {
  toId,
  formatOrderCode,
  formatPurchaseOrderCode,
  escapeRegex,
  parsePagination,
  startOfDay
};
