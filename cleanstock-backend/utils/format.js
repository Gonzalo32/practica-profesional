const toId = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value._id) return value._id.toString();
  return value.toString();
};

const formatOrderCode = (order) => {
  if (order.number) return `PED-${String(order.number).padStart(4, '0')}`;
  return `#${order._id.toString().substring(0, 8).toUpperCase()}`;
};

const formatPurchaseOrderCode = (po) => `OC-${String(po.number).padStart(4, '0')}`;

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const todayAsUTCDate = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
};

const daysUntil = (expirationDate) => {
  const exp = new Date(expirationDate);
  const expDay = Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth(), exp.getUTCDate());
  return Math.round((expDay - todayAsUTCDate().getTime()) / 86400000);
};

module.exports = {
  toId,
  formatOrderCode,
  formatPurchaseOrderCode,
  escapeRegex,
  parsePagination,
  startOfDay,
  todayAsUTCDate,
  daysUntil
};
