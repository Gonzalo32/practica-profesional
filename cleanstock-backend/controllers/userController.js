const bcrypt = require('bcryptjs');
const { User, ActivityLog } = require('../models');
const { toId, escapeRegex, parsePagination, startOfDay } = require('../utils/format');

// T2.1: Crear nuevo usuario (Solo Administrador)
const createUser = async (req, res) => {
  try {
    const { username, password, role, physicalSpaceId, supplierId, firstName, lastName, email, phone, document, cuil, birthDate, address, zipCode } = req.body;

    const userExists = await User.findOne({ $or: [{ username }, ...(email ? [{ email }] : [])] });
    if (userExists) {
      return res.status(400).json({ message: 'Ya existe un usuario con ese correo' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      username,
      passwordHash,
      role: role || 'Solicitante',
      physicalSpaceId: physicalSpaceId || null,
      supplierId: role === 'Proveedor' ? (supplierId || null) : null,
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

    res.status(201).json({ message: 'Usuario creado exitosamente', user: { id: newUser._id.toString(), username, role: newUser.role } });
  } catch (error) {
    res.status(500).json({ message: 'Error creando usuario', error: error.message });
  }
};

// T2.1: Obtener todos los usuarios (y T2.2: Dashboard admin)
const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .populate('physicalSpaceId', 'name type')
      .populate('supplierId', 'name')
      .lean();

    const formattedUsers = users.map(u => ({
      id: u._id.toString(),
      _id: u._id.toString(),
      username: u.username,
      role: u.role,
      isActive: u.isActive,
      physicalSpaceId: toId(u.physicalSpaceId),
      EspacioFisico: u.physicalSpaceId && typeof u.physicalSpaceId === 'object' ? {
        id: u.physicalSpaceId._id.toString(),
        name: u.physicalSpaceId.name,
        type: u.physicalSpaceId.type
      } : null,
      supplierId: toId(u.supplierId),
      Supplier: u.supplierId && typeof u.supplierId === 'object' ? { id: u.supplierId._id.toString(), name: u.supplierId.name } : null,
      createdAt: u.createdAt,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone,
      document: u.document,
      cuil: u.cuil,
      birthDate: u.birthDate,
      address: u.address,
      zipCode: u.zipCode
    }));

    res.json(formattedUsers);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo usuarios', error: error.message });
  }
};

// T2.1: Modificar usuario
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role, physicalSpaceId, supplierId, firstName, lastName, email, phone, document, cuil, birthDate, address, zipCode } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (username && username !== user.username) {
      const taken = await User.exists({ username, _id: { $ne: id } });
      if (taken) return res.status(400).json({ message: 'Ya existe otro usuario con ese correo' });
      user.username = username;
    }
    if (role) {
      if (String(id) === String(req.user.id) && role !== 'Administrador') {
        return res.status(400).json({ message: 'No podés quitarte a vos mismo el rol de Administrador' });
      }
      user.role = role;
    }
    if (password) {
      const salt = await bcrypt.genSalt(10);
      user.passwordHash = await bcrypt.hash(password, salt);
    }
    if (physicalSpaceId !== undefined) user.physicalSpaceId = physicalSpaceId || null;
    if (supplierId !== undefined) user.supplierId = supplierId || null;
    if (user.role !== 'Proveedor') user.supplierId = null;
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
      details: `Administrador actualizó el usuario ${user.username}${password ? ' (con cambio de contraseña)' : ''}`
    });

    res.json({ message: 'Usuario actualizado', user: { id: user._id.toString(), username: user.username, role: user.role } });
  } catch (error) {
    res.status(500).json({ message: 'Error actualizando usuario', error: error.message });
  }
};

// T2.1: Dar de baja usuario (Soft Delete)
const deactivateUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (String(id) === String(req.user.id)) {
      return res.status(400).json({ message: 'No podés dar de baja tu propio usuario' });
    }

    const user = await User.findById(id);
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

// Historial de auditoría con filtros y paginación
// ?action &q (texto) &from &to &page &limit (limit=0 trae todo para exportar)
const getAuditLogs = async (req, res) => {
  try {
    const { action, q, from, to } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (q) filter.details = { $regex: escapeRegex(q), $options: 'i' };
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = startOfDay(from);
      if (to) {
        const end = startOfDay(to);
        end.setDate(end.getDate() + 1);
        filter.createdAt.$lt = end;
      }
    }

    const { page, limit, skip } = parsePagination(req.query, 25);

    const [logs, total, actions] = await Promise.all([
      ActivityLog.find(filter)
        .populate('userId', 'username role firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(filter),
      ActivityLog.distinct('action')
    ]);

    const items = logs.map(l => ({
      id: l._id.toString(),
      _id: l._id.toString(),
      action: l.action,
      details: l.details,
      timestamp: l.timestamp || l.createdAt,
      createdAt: l.createdAt,
      orderId: l.orderId ? l.orderId.toString() : null,
      User: l.userId && typeof l.userId === 'object' ? {
        username: l.userId.username,
        firstName: l.userId.firstName,
        lastName: l.userId.lastName,
        role: l.userId.role
      } : null
    }));

    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)), actions: actions.sort() });
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
