const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_cleanstock_key';

// T1.3: Middleware para validar token
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: 'Se requiere un token de autenticación' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, role, username, branchId }
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
};

// T1.3: Middleware para autorización basada en roles
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'No tienes permisos para realizar esta acción' });
    }

    next();
  };
};

// Módulo 3: Middleware de visibilidad de stock por sucursal
// Admin ve todo. Otros roles solo pueden acceder a su propia sucursal asignada.
const requireBranchAccess = (req, res, next) => {
  const { id } = req.params;
  const user = req.user;

  // Admin siempre tiene acceso total
  if (user.role === 'Administrador') return next();

  // Si el parámetro es 'my-branch', reemplazarlo con el branchId del token
  if (id === 'my-branch') {
    if (!user.branchId) {
      return res.status(403).json({ message: 'No tenés una sucursal asignada. Contactá al administrador.' });
    }
    req.params.id = user.branchId;
    return next();
  }

  // Verificar que el id solicitado coincida con la sucursal del usuario
  if (!user.branchId) {
    return res.status(403).json({ message: 'No tenés una sucursal asignada. Contactá al administrador.' });
  }

  if (id !== user.branchId) {
    return res.status(403).json({ message: 'No tenés acceso al stock de esta sucursal.' });
  }

  next();
};

module.exports = {
  verifyToken,
  requireRole,
  requireBranchAccess,
  JWT_SECRET
};

