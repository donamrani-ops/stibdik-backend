const Product  = require('../models/Product');
const Category = require('../models/Category');
const Boost    = require('../models/Boost');

// ─── Helper boost ranking (non-bloquant) ─────────────────────────────────────
async function enrichWithBoostRank(products) {
  if (!products || products.length === 0) return products;
  try {
    const vendorIds  = [...new Set(products.map(p => String(p.vendor?._id || p.vendor)).filter(Boolean))];
    const productIds = products.map(p => p._id).filter(Boolean);

    const activeBoosts = await Boost.find({
      status: 'active',
      expiresAt: { $gt: new Date() },
      $or: [
        { product: { $in: productIds } },
        { vendor: { $in: vendorIds }, targetType: 'profile' }
      ]
    }).lean();

    const productBoostMap = {};
    const vendorBoostMap  = {};
    activeBoosts.forEach(b => {
      if (b.product) productBoostMap[String(b.product)] = b;
      else if (b.vendor) {
        const vid = String(b.vendor);
        if (!vendorBoostMap[vid] || b.planSnapshot.rankBonus > (vendorBoostMap[vid].planSnapshot?.rankBonus || 0)) {
          vendorBoostMap[vid] = b;
        }
      }
    });

    return products.map(p => {
      const pid   = String(p._id);
      const vid   = String(p.vendor?._id || p.vendor || '');
      const boost = productBoostMap[pid] || vendorBoostMap[vid] || null;
      const boostBonus = boost ? (boost.planSnapshot?.rankBonus || 0) : 0;
      const rating     = p.stats?.avgRating || p.rating || 0;
      const sales      = p.stats?.sales || p.sold || 0;
      const views      = p.views || p.stats?.views || 0;
      const ageDays    = Math.floor((Date.now() - new Date(p.createdAt)) / 86400000);
      const freshness  = Math.max(0, 30 - ageDays);
      const score      = boostBonus + (rating * 10) + (sales * 2) + (views * 0.1) + freshness;
      const pObj = p.toObject ? p.toObject() : { ...p };
      return { ...pObj, isBoosted: !!boost, boostId: boost?._id || null, boostPlan: boost?.planSnapshot?.name || null, rankingScore: Math.round(score) };
    }).sort((a, b) => b.rankingScore - a.rankingScore);
  } catch (err) {
    console.error('Boost ranking error (non-fatal):', err.message);
    return products;
  }
}

// ─── GET /api/products ────────────────────────────────────────────────────────
// FIX : query + category (slug → _id) + subCategory + total correct
exports.getAllProducts = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      query,          // ← FIX 1 : mot-clé de recherche (manquait)
      category,       // peut être un slug ou un _id
      subCategory,    // sous-catégorie (slug ou _id)
      city,
      minPrice,
      maxPrice,
      type,
      vendor,          // filtre par vendeur (ObjectId) — utilisé par VendorShop
      sort = '-createdAt'
    } = req.query;

    // FIX 2 : résoudre slug → ObjectId pour category et subCategory
    let categoryId  = category;
    let subCategoryId = subCategory;

    if (category && !category.match(/^[0-9a-fA-F]{24}$/)) {
      // C'est un slug, pas un ObjectId
      // Chercher par slug sans forcer active:true (plus robuste)
      const cat = await Category.findOne({ slug: category });
      if (cat) {
        categoryId = cat._id;
      } else {
        // Slug non trouvé — retourner vide proprement
        return res.json({ success: true, count: 0, total: 0, page: 1, pages: 0, products: [] });
      }
    }

    if (subCategory && !subCategory.match(/^[0-9a-fA-F]{24}$/)) {
      const subCat = await Category.findOne({ slug: subCategory });
      subCategoryId = subCat ? subCat._id : null;
    }

    // FIX 3 : si subCategory fourni, filtrer sur lui plutôt que la catégorie parente
    const effectiveCategoryId = subCategoryId || categoryId;

    const products = await Product.advancedSearch({
      query,
      category: effectiveCategoryId,
      city,
      minPrice,
      maxPrice,
      type,
      vendor,          // filtre boutique vendeur
      sort,
      page,
      limit
    });

    // FIX 4 : total cohérent avec les filtres appliqués
    const countFilter = { status: 'active' };
    if (effectiveCategoryId) countFilter.category = effectiveCategoryId;
    if (query) countFilter.$text = { $search: query };
    if (vendor) countFilter.vendor = vendor;

    const total = await Product.countDocuments(countFilter);

    const enriched = await enrichWithBoostRank(products);

    res.status(200).json({
      success: true,
      count:   enriched.length,
      total,
      page:    parseInt(page),
      pages:   Math.ceil(total / limit),
      products: enriched
    });
  } catch (error) {
    next(error);
  }
};

// Get single product
exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('vendor',   'name shopName shopLogo')
      .populate('category', 'name nameAr icon slug parent');

    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });

    res.status(200).json({ success: true, product });
  } catch (error) { next(error); }
};

// Create product
exports.createProduct = async (req, res, next) => {
  try {
    req.body.vendor     = req.user._id;
    req.body.vendorName = req.user.shopName || req.user.name;
    const product = await Product.create(req.body);
    res.status(201).json({ success: true, message: 'Produit créé', product });
  } catch (error) { next(error); }
};

// Update product
exports.updateProduct = async (req, res, next) => {
  try {
    let product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    if (product.vendor.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.status(200).json({ success: true, message: 'Produit mis à jour', product });
  } catch (error) { next(error); }
};

// Delete product
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    if (product.vendor.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    await product.deleteOne();
    res.status(200).json({ success: true, message: 'Produit supprimé' });
  } catch (error) { next(error); }
};

// Increment views
exports.incrementViews = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) await product.incrementViews();
    res.status(200).json({ success: true });
  } catch (error) { next(error); }
};

// Get similar products
exports.getSimilarProducts = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    const similar = await Product.findSimilar(product._id, product.category, 6);
    res.status(200).json({ success: true, products: similar });
  } catch (error) { next(error); }
};

// Get trending
exports.getTrending = async (req, res, next) => {
  try {
    const products = await Product.getTrending(10);
    res.status(200).json({ success: true, products });
  } catch (error) { next(error); }
};

// Update category (Admin)
exports.updateProductCategory = async (req, res, next) => {
  try {
    const { category, subCategory } = req.body;
    if (!category) return res.status(400).json({ success: false, message: 'Category is required' });

    // Résoudre slug → ObjectId si nécessaire
    let categoryId = category;
    if (category && !category.match(/^[0-9a-fA-F]{24}$/)) {
      const cat = await Category.findOne({ slug: category });
      if (!cat) return res.status(404).json({ success: false, message: `Catégorie "${category}" introuvable` });
      categoryId = cat._id;
    }

    const update = { category: categoryId };
    // Mettre à jour la sous-catégorie si fournie (stockée comme string slug)
    if (subCategory !== undefined) update.subCategory = subCategory;

    const product = await Product.findByIdAndUpdate(
      req.params.id, update,
      { new: true, runValidators: true }
    ).populate('category', 'name nameAr icon slug');

    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    res.status(200).json({ success: true, message: 'Catégorie mise à jour', product });
  } catch (error) { next(error); }
};
