const mongoose = require('mongoose');
const Product  = require('../models/Product');
const Boost    = require('../models/Boost');
// Import lazy pour éviter les dépendances circulaires
const getStockNotifCtrl = () => require('./stockNotificationController');

// ─── Helper boost ranking (non-bloquant) ────────────────────────────────────
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

// ─── Helper restock — délègue au stockNotificationController ─────────────────
async function triggerRestockNotifications(productId, productName) {
  try {
    await getStockNotifCtrl().notifyOnRestock(productId, productName);
  } catch (err) {
    console.warn('triggerRestockNotifications (non-fatal):', err.message);
  }
}

// Get all products with filters
exports.getAllProducts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, city, minPrice, maxPrice, type, sort = '-createdAt' } = req.query;
    const products = await Product.advancedSearch({ category, city, minPrice, maxPrice, type, sort, page, limit });
    const enriched = await enrichWithBoostRank(products);
    const total    = await Product.countDocuments({ status: 'active' });
    res.status(200).json({ success: true, count: enriched.length, total, page: parseInt(page), pages: Math.ceil(total / limit), products: enriched });
  } catch (error) { next(error); }
};

// Get single product
exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).populate('vendor', 'name shopName shopLogo').populate('category', 'name nameAr icon');
    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    res.status(200).json({ success: true, product });
  } catch (error) { next(error); }
};

// Create product (Vendor/Admin)
exports.createProduct = async (req, res, next) => {
  try {
    req.body.vendor = req.user._id;
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

    const oldStock = Number(product.stock);
    console.log(`📦 updateProduct: "${product.nameFr}" — oldStock=${oldStock}, req.body.stock=${req.body.stock}`);
    product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    const newStock = Number(product.stock);
    console.log(`📦 updateProduct après save: newStock=${newStock}`);

    // Notifier les abonnés si le stock repasse à > 0
    if (oldStock === 0 && newStock > 0) {
      const name = product.nameFr || product.nameAr || 'Produit';
      console.log(`🔔 Déclenchement restock pour "${name}" (${oldStock}→${newStock})`);
      triggerRestockNotifications(product._id, name).catch(e=>console.error('restock error:',e));
    } else {
      console.log(`ℹ️ Pas de restock: oldStock=${oldStock}, newStock=${newStock}`);
    }

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

// Get trending products
exports.getTrending = async (req, res, next) => {
  try {
    const products = await Product.getTrending(10);
    res.status(200).json({ success: true, products });
  } catch (error) { next(error); }
};

// Update product category (admin only)
exports.updateProductCategory = async (req, res, next) => {
  try {
    let { category, subCategory } = req.body;
    if (!category) return res.status(400).json({ success: false, message: 'category requis' });

    // Résoudre slug → ObjectId si nécessaire
    if (!mongoose.Types.ObjectId.isValid(category) || String(category).length !== 24) {
      try {
        const db = mongoose.connection.db;
        const cat = await db.collection('categories').findOne(
          { slug: category },
          { projection: { _id: 1 } }
        );
        if (cat) {
          category = cat._id;
        } else {
          return res.status(404).json({ success: false, message: `Catégorie "${category}" non trouvée` });
        }
      } catch(e) {
        return res.status(500).json({ success: false, message: 'Erreur résolution catégorie' });
      }
    }

    const updateData = { category };
    if (subCategory !== undefined) updateData.subCategory = subCategory;

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('category', 'name nameAr slug icon');

    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    res.status(200).json({ success: true, message: 'Catégorie mise à jour', product });
  } catch (error) { next(error); }
};

// Toggle like (POST = like, DELETE = unlike)
exports.toggleLike = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });

    const userId  = req.user._id.toString();
    const isLike  = req.method === 'POST';
    const likes   = product.likes || 0;

    // Incrémenter/décrémenter le compteur
    await Product.findByIdAndUpdate(req.params.id, {
      $inc: { likes: isLike ? 1 : -1 }
    });

    const newCount = Math.max(0, likes + (isLike ? 1 : -1));
    res.status(200).json({ success: true, liked: isLike, likeCount: newCount });
  } catch (error) { next(error); }
};

// Get my products (vendor)
exports.getMyProducts = async (req, res, next) => {
  try {
    const { limit = 100, status } = req.query;
    const filter = { vendor: req.user._id };
    if (status) filter.status = status;
    const products = await Product.find(filter)
      .sort('-createdAt')
      .limit(Number(limit))
      .populate('category', 'name nameAr slug icon')
      .lean();
    res.status(200).json({ success: true, products, total: products.length });
  } catch (error) { next(error); }
};
