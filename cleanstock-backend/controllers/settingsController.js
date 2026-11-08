const { PhysicalSpace, ActivityLog } = require('../models');
const { getSettings, saveSettings } = require('../services/settingsService');
const { toId } = require('../utils/format');

const formatSettings = async (s) => {
  const mainBranch = s.mainBranchId ? await PhysicalSpace.findById(s.mainBranchId).lean() : null;
  return {
    businessName: s.businessName,
    singleBranchMode: !!s.singleBranchMode,
    mainBranchId: toId(s.mainBranchId),
    mainBranch: mainBranch ? { id: mainBranch._id.toString(), name: mainBranch.name, type: mainBranch.type } : null
  };
};

const getBusinessSettings = async (req, res) => {
  try {
    res.json(await formatSettings(await getSettings()));
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo la configuración', error: error.message });
  }
};

const updateBusinessSettings = async (req, res) => {
  try {
    const { businessName, singleBranchMode } = req.body;
    let { mainBranchId } = req.body;
    const data = {};

    if (businessName !== undefined) data.businessName = businessName;

    if (singleBranchMode !== undefined) {
      data.singleBranchMode = singleBranchMode;
      if (singleBranchMode) {
        if (mainBranchId) {
          const exists = await PhysicalSpace.exists({ _id: mainBranchId });
          if (!exists) return res.status(404).json({ message: 'El local seleccionado no existe' });
        } else {
          const count = await PhysicalSpace.countDocuments();
          if (count > 0) {
            return res.status(400).json({ message: 'Seleccioná cuál de los locales cargados es el local principal.' });
          }
          const name = businessName || (await getSettings()).businessName || 'Local principal';
          const created = await PhysicalSpace.create({ name, type: 'sucursal' });
          mainBranchId = created._id;
        }
        data.mainBranchId = mainBranchId;
      }
    }

    const saved = await saveSettings(data);

    await ActivityLog.create({
      userId: req.user.id,
      action: 'UPDATE_SETTINGS',
      details: `Actualizó la configuración del negocio (modo: ${saved.singleBranchMode ? 'un solo local' : 'varias sucursales'})`
    });

    res.json(await formatSettings(saved));
  } catch (error) {
    res.status(500).json({ message: 'Error guardando la configuración', error: error.message });
  }
};

module.exports = {
  getBusinessSettings,
  updateBusinessSettings
};
