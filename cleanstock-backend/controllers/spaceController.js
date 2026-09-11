const { PhysicalSpace, ActivityLog } = require('../models');

// Crear Espacio Físico (Solo Administrador)
const createSpace = async (req, res) => {
  try {
    const { name, description, type } = req.body;

    if (!name || !type) {
      return res.status(400).json({ message: 'El nombre y el tipo son obligatorios' });
    }

    const validTypes = ['filial', 'Zona', 'sucursal', 'dependencia', 'sector'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: `Tipo inválido. Debe ser uno de: ${validTypes.join(', ')}` });
    }

    const spaceExists = await PhysicalSpace.findOne({ where: { name } });
    if (spaceExists) {
      return res.status(400).json({ message: 'Ya existe un espacio físico con ese nombre' });
    }

    const space = await PhysicalSpace.create({ name, description, type });

    await ActivityLog.create({
      userId: req.user.id,
      action: 'CREATE_SPACE',
      details: `Administrador creó el espacio físico "${name}" (${type})`
    });

    res.status(201).json({ message: 'Espacio físico creado exitosamente', space });
  } catch (error) {
    res.status(500).json({ message: 'Error creando espacio físico', error: error.message });
  }
};

// Obtener todos los Espacios Físicos
const getSpaces = async (req, res) => {
  try {
    const spaces = await PhysicalSpace.findAll({
      order: [['name', 'ASC']]
    });
    res.json(spaces);
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo espacios físicos', error: error.message });
  }
};

// Modificar Espacio Físico (Solo Administrador)
const updateSpace = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, type } = req.body;

    const space = await PhysicalSpace.findByPk(id);
    if (!space) {
      return res.status(404).json({ message: 'Espacio físico no encontrado' });
    }

    if (type) {
      const validTypes = ['filial', 'Zona', 'sucursal', 'dependencia', 'sector'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ message: `Tipo inválido. Debe ser uno de: ${validTypes.join(', ')}` });
      }
      space.type = type;
    }

    if (name) {
      const nameExists = await PhysicalSpace.findOne({ where: { name } });
      if (nameExists && nameExists.id !== id) {
        return res.status(400).json({ message: 'Ya existe otro espacio físico con ese nombre' });
      }
      space.name = name;
    }

    if (description !== undefined) {
      space.description = description;
    }

    await space.save();

    await ActivityLog.create({
      userId: req.user.id,
      action: 'UPDATE_SPACE',
      details: `Administrador actualizó el espacio físico "${space.name}"`
    });

    res.json({ message: 'Espacio físico actualizado exitosamente', space });
  } catch (error) {
    res.status(500).json({ message: 'Error actualizando espacio físico', error: error.message });
  }
};

// Dar de baja/Eliminar Espacio Físico (Solo Administrador)
const deleteSpace = async (req, res) => {
  try {
    const { id } = req.params;

    const space = await PhysicalSpace.findByPk(id);
    if (!space) {
      return res.status(404).json({ message: 'Espacio físico no encontrado' });
    }

    const spaceName = space.name;
    await space.destroy();

    await ActivityLog.create({
      userId: req.user.id,
      action: 'DELETE_SPACE',
      details: `Administrador eliminó el espacio físico "${spaceName}"`
    });

    res.json({ message: 'Espacio físico eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error eliminando espacio físico', error: error.message });
  }
};

module.exports = {
  createSpace,
  getSpaces,
  updateSpace,
  deleteSpace
};
