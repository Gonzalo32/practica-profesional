const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { effectiveBranchId } = require('../services/settingsService');

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('ADVERTENCIA: falta JWT_SECRET en el .env. Se usa un secreto temporal; las sesiones se cerrarán al reiniciar el servidor.');
  return crypto.randomBytes(48).toString('hex');
})();

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(403).json({ message: 'Se requiere un token de autenticación' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
};

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

const requireBranchAccess = async (req, res, next) => {
  const { id } = req.params;
  const user = req.user;
  const ownBranch = await effectiveBranchId(user);

  if (id === 'my-branch') {
    if (!ownBranch) {
      return res.status(403).json({ message: 'No tenés una sucursal asignada. Contactá al administrador.' });
    }
    req.params.id = ownBranch;
    return next();
  }

  if (user.role === 'Administrador') return next();

  if (!ownBranch) {
    return res.status(403).json({ message: 'No tenés una sucursal asignada. Contactá al administrador.' });
  }

  if (id !== ownBranch) {
    return res.status(403).json({ message: 'No tenés acceso al stock de esta sucursal.' });
  }

  next();
};

const canAccessBranch = async (user, branchId) =>
  user.role === 'Administrador' || (await effectiveBranchId(user)) === String(branchId);

module.exports = {
  canAccessBranch,
  verifyToken,
  requireRole,
  requireBranchAccess,
  JWT_SECRET
};
