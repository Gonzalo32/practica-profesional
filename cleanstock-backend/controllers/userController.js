const bcrypt = require('bcryptjs');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

// T2.1: Crear nuevo usuario (Solo Administrador)
const createUser = async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    const userExists = await User.findOne({ where: { username } });
    if (userExists) {
      return res.status(400).json({ message: 'El usuario ya existe' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    const newUser = await User.create({
      username,
      passwordHash,
      role: role || 'Solicitante'
    });
    
    await ActivityLog.create({
      userId: req.user.id,
      action: 'CREATE_USER',
      details: `Administrador creó el usuario ${username} con rol ${newUser.role}`
    });
    
    res.status(201).json({ message: 'Usuario creado exitosamente', user: { id: newUser.id, username, role: newUser.role } });
  } catch (error) {
    res.status(500).json({ message: 'Error creando usuario' });
  }
};

// T2.1: Obtener todos los usuarios (y T2.2: Dashboard admin)
const getUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'role', 'isActive', 'createdAt']
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo usuarios' });
  }
};

// T2.1: Modificar usuario
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, role } = req.body;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    user.username = username || user.username;
    user.role = role || user.role;
    
    await user.save();
    
    await ActivityLog.create({
      userId: req.user.id,
      action: 'UPDATE_USER',
      details: `Administrador actualizó el usuario ${user.username}`
    });
    
    res.json({ message: 'Usuario actualizado', user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    res.status(500).json({ message: 'Error actualizando usuario' });
  }
};

// T2.1: Dar de baja usuario (Soft Delete)
const deactivateUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    
    user.isActive = false;
    await user.save();
    
    await ActivityLog.create({
      userId: req.user.id,
      action: 'DEACTIVATE_USER',
      details: `Administrador dio de baja al usuario ${user.username}`
    });
    
    res.json({ message: 'Usuario dado de baja' });
  } catch (error) {
    res.status(500).json({ message: 'Error al dar de baja el usuario' });
  }
};

module.exports = {
  createUser,
  getUsers,
  updateUser,
  deactivateUser
};
