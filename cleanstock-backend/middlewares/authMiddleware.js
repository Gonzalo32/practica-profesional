const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { effectiveBranchId } = require('../services/settingsService');

// El secreto tiene que venir del .env. Si falta, se genera uno aleatorio para que
// nadie pueda firmar tokens con un valor conocido (las sesiones se cierran al reiniciar).
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('ADVERTENCIA: falta JWT_SECRET en el .env. Se usa un secreto temporal; las sesiones se cerrarán al reiniciar el servidor.');
  return crypto.randomBytes(48).toString('hex');
})();

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
// Admin ve todo. Otros roles solo pueden acceder a su propia sucursal asignada
// (o al local principal, si el negocio trabaja en modo de un solo local).
const requireBranchAccess = async (req, res, next) => {
  const { id } = req.params;
  const user = req.user;
  const ownBranch = await effectiveBranchId(user);

  // Si el parámetro es 'my-branch', reemplazarlo con la sucursal del usuario
  if (id === 'my-branch') {
    if (!ownBranch) {
      return res.status(403).json({ message: 'No tenés una sucursal asignada. Contactá al administrador.' });
    }
    req.params.id = ownBranch;
    return next();
  }

  // Admin siempre tiene acceso total
  if (user.role === 'Administrador') return next();

  if (!ownBranch) {
    return res.status(403).json({ message: 'No tenés una sucursal asignada. Contactá al administrador.' });
  }

  if (id !== ownBranch) {
    return res.status(403).json({ message: 'No tenés acceso al stock de esta sucursal.' });
  }

  next();
};

// Para controladores: el Administrador accede a todas las sucursales, el resto solo a la propia
const canAccessBranch = async (user, branchId) =>
  user.role === 'Administrador' || (await effectiveBranchId(user)) === String(branchId);

module.exports = {
  canAccessBranch,
  verifyToken,
  requireRole,
  requireBranchAccess,
  JWT_SECRET
};

