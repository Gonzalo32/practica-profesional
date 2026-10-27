const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { JWT_SECRET } = require('../middlewares/authMiddleware');

// T1.2: Generación de Tokens al loguear exitosamente
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({
      $or: [
        { username: username },
        { email: username }
      ]
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Credenciales inválidas o usuario inactivo' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    // T1.2: Incluir rol + sucursal del usuario en el payload (Módulo 4)
    const payload = {
      id: user._id.toString(),
      username: user.username,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      role: user.role,
      branchId: user.physicalSpaceId ? user.physicalSpaceId.toString() : null,
      supplierId: user.supplierId ? user.supplierId.toString() : null
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    // T1.5: Registro de Actividad
    await ActivityLog.create({
      userId: user._id,
      action: 'LOGIN',
      details: 'El usuario inició sesión exitosamente'
    });

    res.json({ token, user: payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

// T1.4: Sistema de tokens para validaciones específicas
const generateValidationToken = async (req, res) => {
  try {
    const { orderId, action } = req.body;

    const payload = {
      adminId: req.user.id,
      orderId,
      action,
      type: 'validation_token'
    };

    const validationToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'GENERATE_VALIDATION_TOKEN',
      details: `Generó token de validación para una orden`,
      orderId
    });

    res.json({ validationToken });
  } catch (error) {
    res.status(500).json({ message: 'Error generando token de validación' });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('physicalSpaceId', 'name type')
      .populate('supplierId', 'name');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json({
      id: user._id.toString(),
      username: user.username,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      role: user.role,
      phone: user.phone || '',
      document: user.document || '',
      cuil: user.cuil || '',
      branchId: user.physicalSpaceId ? (user.physicalSpaceId._id ? user.physicalSpaceId._id.toString() : user.physicalSpaceId) : null,
      supplierId: user.supplierId ? (user.supplierId._id ? user.supplierId._id.toString() : user.supplierId) : null,
      Supplier: user.supplierId && typeof user.supplierId === 'object' ? { id: user.supplierId._id.toString(), name: user.supplierId.name } : null,
      EspacioFisico: user.physicalSpaceId && typeof user.physicalSpaceId === 'object' ? {
        id: user.physicalSpaceId._id.toString(),
        name: user.physicalSpaceId.name,
        type: user.physicalSpaceId.type
      } : null
    });
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo perfil', error: error.message });
  }
};

module.exports = {
  login,
  generateValidationToken,
  getMe
};
