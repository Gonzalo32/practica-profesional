const bcrypt = require('bcryptjs');
const { User, ActivityLog, PhysicalSpace } = require('../models');

// T2.1: Crear nuevo usuario (Solo Administrador)
const createUser = async (req, res) => {
  try {
    const { username, password, role, physicalSpaceId, firstName, lastName, email, phone, document, cuil, birthDate, address, zipCode } = req.body;

    const userExists = await User.findOne({ where: { username } });
    if (userExists) {
      return res.status(400).json({ message: 'El usuario ya existe' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      username,
      passwordHash,
      role: role || 'Solicitante',
      physicalSpaceId: physicalSpaceId || null,
      firstName: firstName || null,
      lastName: lastName || null,
      email: email || null,
      phone: phone || null,
      document: document || null,
      cuil: cuil || null,
      birthDate: birthDate || null,
      address: address || null,
      zipCode: zipCode || null
    });
    
    await ActivityLog.create({
      userId: req.user.id,
      action: 'CREATE_USER',
      details: `Administrador creó el usuario ${username} con rol ${newUser.role}`
    });
    
    res.status(201).json({ message: 'Usuario creado exitosamente', user: { id: newUser.id, username, role: newUser.role } });
  } catch (error) {
    res.status(500).json({ message: 'Error creando usuario', error: error.message });
  }
};

// T2.1: Obtener todos los usuarios (y T2.2: Dashboard admin)
const getUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'role', 'isActive', 'physicalSpaceId', 'createdAt', 'firstName', 'lastName', 'email', 'phone', 'document', 'cuil', 'birthDate', 'address', 'zipCode'],
      include: [{ model: PhysicalSpace, as: 'EspacioFisico', attributes: ['id', 'name', 'type'] }]
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo usuarios', error: error.message });
  }
};

// T2.1: Modificar usuario
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, role, physicalSpaceId, firstName, lastName, email, phone, document, cuil, birthDate, address, zipCode } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (username) user.username = username;
    if (role) user.role = role;
    if (physicalSpaceId !== undefined) user.physicalSpaceId = physicalSpaceId || null;
    if (firstName !== undefined) user.firstName = firstName || null;
    if (lastName !== undefined) user.lastName = lastName || null;
    if (email !== undefined) user.email = email || null;
    if (phone !== undefined) user.phone = phone || null;
    if (document !== undefined) user.document = document || null;
    if (cuil !== undefined) user.cuil = cuil || null;
    if (birthDate !== undefined) user.birthDate = birthDate || null;
    if (address !== undefined) user.address = address || null;
    if (zipCode !== undefined) user.zipCode = zipCode || null;
    
    await user.save();
    
    await ActivityLog.create({
      userId: req.user.id,
      action: 'UPDATE_USER',
      details: `Administrador actualizó el usuario ${user.username}`
    });
    
    res.json({ message: 'Usuario actualizado', user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    res.status(500).json({ message: 'Error actualizando usuario', error: error.message });
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

const getAuditLogs = async (req, res) => {
  try {
    const logs = await ActivityLog.findAll({
      include: [{ model: User, attributes: ['username', 'role'] }],
      order: [['timestamp', 'DESC']]
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo logs de auditoría', error: error.message });
  }
};

module.exports = {
  createUser,
  getUsers,
  updateUser,
  deactivateUser,
  getAuditLogs
};
