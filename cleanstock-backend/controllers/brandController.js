const { Brand, Product, ActivityLog } = require('../models');
const { normalizeBrand } = require('../models/Brand');
const { escapeRegex } = require('../utils/format');

// Distancia de edición (Levenshtein): cuántas letras hay que cambiar para pasar de una palabra a otra
const editDistance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
};

// Marcas que se parecen mucho a la que se quiere crear (posible error de tipeo: "Ayudim" → "Ayudín")
const similarBrands = async (normalized, excludeId = null) => {
  const all = await Brand.find(excludeId ? { _id: { $ne: excludeId } } : {}).lean();
  const tolerance = normalized.length <= 4 ? 1 : 2;
  return all
    .map(b => ({ b, d: editDistance(normalized, b.normalizedName) }))
    .filter(x => x.d <= tolerance || (normalized.length >= 4 && (x.b.normalizedName.startsWith(normalized) || normalized.startsWith(x.b.normalizedName))))
    .sort((x, y) => x.d - y.d)
    .slice(0, 3)
    .map(x => ({ id: x.b._id.toString(), name: x.b.name }));
};

const format = (b, products = 0) => ({ id: b._id.toString(), name: b.name, products });

/**
 * GET /api/inventory/brands?q=&limit=
 * Busca marcas por nombre (sin importar mayúsculas ni tildes). Sin q devuelve todas.
 */
const getBrands = async (req, res) => {
  try {
    const filter = {};
    const q = normalizeBrand(req.query.q);
    if (q) filter.normalizedName = new RegExp(escapeRegex(q));
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 500));
    const [brands, counts] = await Promise.all([
      Brand.find(filter).sort({ normalizedName: 1 }).limit(limit).lean(),
      Product.aggregate([{ $match: { brandId: { $ne: null } } }, { $group: { _id: '$brandId', n: { $sum: 1 } } }])
    ]);
    const byBrand = new Map(counts.map(c => [String(c._id), c.n]));
    res.json(brands.map(b => format(b, byBrand.get(b._id.toString()) || 0)));
  } catch (error) {
    res.status(500).json({ message: 'Error obteniendo marcas', error: error.message });
  }
};

/**
 * POST /api/inventory/brands { name, force? }
 * - Si ya existe escrita de otra forma → 409 con la existente (no se duplica nunca).
 * - Si se parece a otra (posible error de tipeo) → 409 con sugerencias, salvo que venga force: true.
 */
const createBrand = async (req, res) => {
  try {
    const name = String(req.body.name || '').replace(/\s+/g, ' ').trim();
    const normalized = normalizeBrand(name);
    if (!normalized) return res.status(400).json({ message: 'Escribí el nombre de la marca.' });

    const existing = await Brand.findOne({ normalizedName: normalized }).lean();
    if (existing) {
      return res.status(409).json({ message: `La marca "${existing.name}" ya existe.`, existing: format(existing) });
    }
    if (!req.body.force) {
      const similar = await similarBrands(normalized);
      if (similar.length) {
        return res.status(409).json({ message: `¿Quisiste decir ${similar.map(s => `"${s.name}"`).join(' o ')}?`, similar });
      }
    }

    const brand = await Brand.create({ name });
    await ActivityLog.create({ userId: req.user.id, action: 'CREATE_BRAND', details: `Agregó la marca "${brand.name}"` });
    res.status(201).json(format(brand));
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'Esa marca ya existe.' });
    res.status(500).json({ message: 'Error creando la marca', error: error.message });
  }
};

/**
 * PUT /api/inventory/brands/:id { name }
 * Renombrar corrige la marca en todos sus productos a la vez (los productos guardan la marca, no el texto).
 */
const updateBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ message: 'Marca no encontrada' });
    const name = String(req.body.name || '').replace(/\s+/g, ' ').trim();
    const normalized = normalizeBrand(name);
    if (!normalized) return res.status(400).json({ message: 'Escribí el nombre de la marca.' });

    const clash = await Brand.findOne({ normalizedName: normalized, _id: { $ne: brand._id } }).lean();
    if (clash) return res.status(409).json({ message: `Ya existe la marca "${clash.name}".`, existing: format(clash) });

    const before = brand.name;
    brand.name = name;
    await brand.save();
    await ActivityLog.create({ userId: req.user.id, action: 'UPDATE_BRAND', details: `Renombró la marca "${before}" a "${brand.name}"` });
    res.json(format(brand));
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'Esa marca ya existe.' });
    res.status(500).json({ message: 'Error actualizando la marca', error: error.message });
  }
};

/**
 * DELETE /api/inventory/brands/:id — solo si ningún producto la usa
 */
const deleteBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id).lean();
    if (!brand) return res.status(404).json({ message: 'Marca no encontrada' });
    const linked = await Product.countDocuments({ brandId: brand._id });
    if (linked) {
      return res.status(400).json({ message: `No se puede eliminar "${brand.name}": la usan ${linked} producto(s). Cambiales la marca primero.` });
    }
    await Brand.deleteOne({ _id: brand._id });
    await ActivityLog.create({ userId: req.user.id, action: 'DELETE_BRAND', details: `Eliminó la marca "${brand.name}"` });
    res.json({ message: 'Marca eliminada' });
  } catch (error) {
    res.status(500).json({ message: 'Error eliminando la marca', error: error.message });
  }
};

module.exports = { getBrands, createBrand, updateBrand, deleteBrand, similarBrands, editDistance };
