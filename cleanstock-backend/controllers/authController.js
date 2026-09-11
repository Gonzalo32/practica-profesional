const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { JWT_SECRET } = require('../middlewares/authMiddleware');

// T1.2: Generación de Tokens al loguear exitosamente
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ where: { username } });
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Credenciales inválidas o usuario inactivo' });
    }
    
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }
    
    // T1.2: Incluir rol del usuario en el payload
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role
    };
    
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
    
    // T1.5: Registro de Actividad
    await ActivityLog.create({
      userId: user.id,
      action: 'LOGIN',
      details: 'El usuario inició sesión exitosamente'
    });
    
    res.json({ token, user: payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};

// Endpoint auxiliar para generar un usuario inicial (admin) y probar
const registerInitialAdmin = async (req, res) => {
  try {
    const adminExists = await User.findOne({ where: { role: 'Administrador' } });
    if (adminExists) {
      return res.status(400).json({ message: 'Ya existe un administrador' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('admin123', salt);
    
    const admin = await User.create({
      username: 'admin',
      passwordHash,
      role: 'Administrador'
    });
    
    res.status(201).json({ message: 'Administrador creado', id: admin.id });
  } catch (error) {
    res.status(500).json({ message: 'Error creando administrador' });
  }
};

// T1.4: Sistema de tokens para validaciones específicas
const generateValidationToken = async (req, res) => {
  try {
    // Solo un admin podría generar esto para una orden específica, etc.
    const { orderId, action } = req.body;
    
    const payload = {
      adminId: req.user.id,
      orderId,
      action,
      type: 'validation_token'
    };
    
    // Token de corta duración (ej. 15 minutos)
    const validationToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
    
    // Log the generation
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
