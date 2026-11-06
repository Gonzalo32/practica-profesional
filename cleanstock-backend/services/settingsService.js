const Settings = require('../models/Settings');

// La configuración se lee en casi todas las peticiones (permisos por sucursal),
// así que se guarda en memoria y se refresca al modificarla.
let cache = null;

const getSettings = async () => {
  if (!cache) {
    const doc = await Settings.findById('general').lean();
    cache = doc || { _id: 'general', businessName: 'Mi Negocio', singleBranchMode: false, mainBranchId: null };
  }
  return cache;
};

const saveSettings = async (data) => {
  const doc = await Settings.findOneAndUpdate(
    { _id: 'general' },
    { $set: data },
    { returnDocument: 'after', upsert: true }
  ).lean();
  cache = doc;
  return doc;
};

// Sucursal con la que opera el usuario: la asignada o, en modo de un solo local, el local principal
const effectiveBranchId = async (user) => {
  if (user.branchId) return String(user.branchId);
  const settings = await getSettings();
  return settings.singleBranchMode && settings.mainBranchId ? String(settings.mainBranchId) : null;
};

const clearSettingsCache = () => { cache = null; };

module.exports = {
  getSettings,
  saveSettings,
  effectiveBranchId,
  clearSettingsCache
};
