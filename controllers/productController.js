const mongoose = require('mongoose');
const Product  = require('../models/Product');
const Boost    = require('../models/Boost');

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

// ─── Helper restock — notifie les abonnés (chargement lazy pour éviter circular deps) ─
async function triggerRestockNotifications(productId, productName) {
  try {
    // Chargement lazy pour éviter les dépendances circulaires
    const StockNotification = require('../models/StockNotification');
    const emailService      = require('../services/emailService');
    const subs = await StockNotification.find({ product: productId, notified: false });
    if (!subs.length) return;
    await Promise.all(subs.map(async (sub) => {
      try {
        if (emailService.sendRestockNotification) {
          await emailService.sendRestockNotification(sub.email, sub.userName, productName, productId);
        }
        sub.notified   = true;
        sub.notifiedAt = new Date();
        await sub.save();
      } catch (e) { console.warn('Restock email failed:', e.message); }
    }));
    console.log(`✅ ${subs.length} restock notification(s) sent for ${productName}`);
  } catch (err) {
    // StockNotification model peut ne pas exister encore — silencieux
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

    const oldStock = product.stock || 0;
    product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    const newStock = product.stock || 0;

    // Notifier les abonnés si le stock repasse à > 0
    if (oldStock === 0 && newStock > 0) {
      const name = product.nameFr || product.nameAr || 'Produit';
      triggerRestockNotifications(product._id, name).catch(() => {});
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
