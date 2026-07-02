const Brand = require('../models/Brand');
const Product = require('../models/Product');

// ─── PUBLIC ──────────────────────────────────────────────────────────────────

// Liste publique : marques actives de la collection + count depuis les produits.
// Fusionne les métadonnées (logo, ordre) avec la popularité réelle.
exports.getBrands = async (req, res, next) => {
  try {
    // 1. Compter les produits actifs par marque (normalisée)
    const counts = await Product.aggregate([
      { $match: { status: 'active', brand: { $nin: ['', null] } } },
      { $group: { _id: { $toLower: '$brand' }, name: { $first: '$brand' }, count: { $sum: 1 } } },
    ]);

    // Map normalizedName -> { name, count }
    const countMap = {};
    counts.forEach(c => {
      const norm = (c.name || '').toLowerCase().trim().replace(/['\u2019\s]/g, '');
      countMap[norm] = { name: c.name, count: c.count };
    });

    // 2. Récupérer les marques de la collection (avec logo/ordre)
    const dbBrands = await Brand.find({ isActive: true }).lean();
    const dbByNorm = {};
    dbBrands.forEach(b => { dbByNorm[b.normalizedName] = b; });

    // 3. Fusionner : toutes les marques (collection + produits)
    const merged = {};

    // a) Marques de la collection
    dbBrands.forEach(b => {
      const c = countMap[b.normalizedName];
      merged[b.normalizedName] = {
        name: b.name,
        logo: b.logo || '',
        displayOrder: b.displayOrder || 0,
        count: c ? c.count : 0,
        inCollection: true,
      };
    });

    // b) Marques présentes dans les produits mais pas dans la collection
    Object.keys(countMap).forEach(norm => {
      if (!merged[norm]) {
        merged[norm] = {
          name: countMap[norm].name,
          logo: '',
          displayOrder: 0,
          count: countMap[norm].count,
          inCollection: false,
        };
      }
    });

    // 4. Trier : displayOrder d'abord (si défini), puis popularité, puis nom
    const list = Object.values(merged).sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });

    res.status(200).json({
      success: true,
      count: list.length,
      brands: list.map(b => ({ name: b.name, logo: b.logo, count: b.count })),
    });
  } catch (error) { next(error); }
};

// ─── ADMIN ───────────────────────────────────────────────────────────────────

// Liste admin complète (actives + inactives, avec count)
exports.getAllBrands = async (req, res, next) => {
  try {
    const counts = await Product.aggregate([
      { $match: { brand: { $nin: ['', null] } } },
      { $group: { _id: { $toLower: '$brand' }, count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id] = c.count; });

    const brands = await Brand.find().sort({ displayOrder: 1, name: 1 }).lean();
    const withCounts = brands.map(b => ({
      ...b,
      productCount: countMap[b.normalizedName] || 0,
    }));

    res.status(200).json({ success: true, count: withCounts.length, brands: withCounts });
  } catch (error) { next(error); }
};

// Créer une marque
exports.createBrand = async (req, res, next) => {
  try {
    const { name, logo = '', displayOrder = 0, isActive = true } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Le nom est obligatoire' });
    }

    const normalizedName = name.toLowerCase().trim().replace(/['\u2019\s]/g, '');
    const existing = await Brand.findOne({ normalizedName });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Cette marque existe déjà' });
    }

    const brand = await Brand.create({ name: name.trim(), logo, displayOrder, isActive });
    res.status(201).json({ success: true, message: 'Marque créée', brand });
  } catch (error) { next(error); }
};

// Modifier une marque
exports.updateBrand = async (req, res, next) => {
  try {
    const { name, logo, displayOrder, isActive } = req.body;
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ success: false, message: 'Marque non trouvée' });

    if (typeof name === 'string' && name.trim()) {
      brand.name = name.trim();
      brand.normalizedName = name.toLowerCase().trim().replace(/['\u2019\s]/g, '');
    }
    if (typeof logo === 'string')        brand.logo = logo;
    if (typeof displayOrder === 'number') brand.displayOrder = displayOrder;
    if (typeof isActive === 'boolean')    brand.isActive = isActive;

    await brand.save();
    res.status(200).json({ success: true, message: 'Marque mise à jour', brand });
  } catch (error) { next(error); }
};

// Supprimer une marque (les produits gardent leur champ brand texte)
exports.deleteBrand = async (req, res, next) => {
  try {
    const brand = await Brand.findByIdAndDelete(req.params.id);
    if (!brand) return res.status(404).json({ success: false, message: 'Marque non trouvée' });
    res.status(200).json({ success: true, message: 'Marque supprimée' });
  } catch (error) { next(error); }
};
