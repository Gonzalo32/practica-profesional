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
      role: user.role,
      branchId: user.physicalSpaceId ? user.physicalSpaceId.toString() : null
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

const registerInitialAdmin = async (req, res) => {
  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('admin123', salt);
    
    let admin = await User.findOne({
      $or: [
        { email: 'admin@cleanstock.com' },
        { username: 'admin@cleanstock.com' },
        { username: 'admin' },
        { role: 'Administrador' }
      ]
    });

    if (!admin) {
      admin = await User.create({
        username: 'admin@cleanstock.com',
        email: 'admin@cleanstock.com',
        passwordHash,
        role: 'Administrador',
        firstName: 'Administrador',
        lastName: 'Principal',
        phone: '1122334455',
        document: '20-12345678-9',
        cuil: '20-12345678-9',
        birthDate: '1990-01-01',
        address: 'Av. Central 123',
        zipCode: '1000',
        isActive: true
      });
    } else {
      admin.username = 'admin@cleanstock.com';
      admin.email = 'admin@cleanstock.com';
      admin.passwordHash = passwordHash;
      admin.firstName = admin.firstName || 'Administrador';
      admin.lastName = admin.lastName || 'Principal';
      admin.phone = admin.phone || '1122334455';
      admin.document = admin.document || '20-12345678-9';
      admin.cuil = admin.cuil || '20-12345678-9';
      admin.birthDate = admin.birthDate || '1990-01-01';
      admin.address = admin.address || 'Av. Central 123';
      admin.zipCode = admin.zipCode || '1000';
      admin.isActive = true;
      await admin.save();
    }
    
    res.status(200).json({ message: 'Usuario administrador inicializado exitosamente', email: 'admin@cleanstock.com' });
  } catch (error) {
    res.status(500).json({ message: 'Error creando usuario de prueba', error: error.message });
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
      details: `Generó token de validación para orden ${orderId}`
    });
    
    res.json({ validationToken });
  } catch (error) {
    res.status(500).json({ message: 'Error generando token de validación' });
  }
};

module.exports = {
  login,
  registerInitialAdmin,
  generateValidationToken
};
