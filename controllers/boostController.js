// Controller: Boosts (Mise en avant vendeur)
const Boost   = require('../models/Boost');
const Product = require('../models/Product');
const User    = require('../models/User');
const mongoose = require('mongoose');

const PLANS = Boost.PLANS;

// ─── Helper : expire les anciens à chaque requête ────────────────────────────
const autoExpire = () => Boost.expireOld().catch(() => {});

// ─── GET /api/boosts/plans ───────────────────────────────────────────────────
// @desc  Liste des plans disponibles (public)
exports.getPlans = (req, res) => {
  res.json({ success: true, plans: Object.values(PLANS) });
};

// ─── POST /api/boosts/request ────────────────────────────────────────────────
// @desc  Vendeur demande un boost (en attente de validation admin)
// @body  { planId, targetType, productId?, paymentReference, proofUrl? }
// @access Vendor
exports.requestBoost = async (req, res, next) => {
  try {
    autoExpire();
    const { planId, targetType = 'profile', productId, paymentReference, proofUrl } = req.body;

    // Valider le plan
    const plan = PLANS[planId];
    if (!plan) {
      return res.status(400).json({ success: false, message: `Plan invalide. Plans disponibles : ${Object.keys(PLANS).join(', ')}` });
    }

    // Si boost produit → vérifier que le produit existe et appartient au vendeur
    if (targetType === 'product') {
      if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ success: false, message: 'productId requis pour un boost produit' });
      }
      const product = await Product.findById(productId);
      if (!product) return res.status(404).json({ success: false, message: 'Produit introuvable' });
      if (product.vendor.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Ce produit ne vous appartient pas' });
      }
      // Vérifier qu'il n'y a pas déjà un boost actif ou en attente sur ce produit
      const existing = await Boost.findOne({
        product: productId,
        status: { $in: ['pending', 'active'] },
        ...(status === 'active' ? { expiresAt: { $gt: new Date() } } : {})
      });
      if (existing) {
        return res.status(409).json({ success: false, message: 'Ce produit a déjà un boost actif ou en attente de validation' });
      }
    } else {
      // Boost profil : vérifier pas de boost profil déjà actif
      const existing = await Boost.findOne({
        vendor: req.user._id,
        targetType: 'profile',
        status: { $in: ['pending', 'active'] }
      });
      if (existing) {
        return res.status(409).json({ success: false, message: 'Vous avez déjà un boost profil actif ou en attente de validation' });
      }
    }

    const boost = await Boost.create({
      vendor:      req.user._id,
      product:     targetType === 'product' ? productId : null,
      targetType,
      planId,
      planSnapshot: {
        name:      plan.name,
        price:     plan.price,
        duration:  plan.duration,
        rankBonus: plan.rankBonus,
        features:  plan.features
      },
      durationHours: plan.duration,
      payment: {
        amount:    plan.price,
        reference: paymentReference || '',
        proofUrl:  proofUrl || null
      }
    });

    res.status(201).json({
      success: true,
      message: 'Demande de boost envoyée. L\'admin va valider votre paiement sous 24h.',
      boost
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/boosts/my ──────────────────────────────────────────────────────
// @desc  Boosts du vendeur connecté (actifs + historique)
// @access Vendor
exports.getMyBoosts = async (req, res, next) => {
  try {
    autoExpire();
    const boosts = await Boost.find({ vendor: req.user._id })
      .populate('product', 'nameFr nameAr images status')
      .sort('-createdAt')
      .limit(50);

    const active = boosts.filter(b => b.status === 'active' && b.expiresAt > new Date());
    const pending = boosts.filter(b => b.status === 'pending');

    res.json({ success: true, boosts, activeCount: active.length, pendingCount: pending.length });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/boosts/my/stats ────────────────────────────────────────────────
// @desc  Stats analytics du vendeur
// @access Vendor
exports.getMyStats = async (req, res, next) => {
  try {
    const boosts = await Boost.find({
      vendor: req.user._id,
      status: { $in: ['active', 'expired'] }
    });

    const totalImpressions = boosts.reduce((s, b) => s + (b.analytics.impressions || 0), 0);
    const totalClicks      = boosts.reduce((s, b) => s + (b.analytics.clicks      || 0), 0);
    const totalConversions = boosts.reduce((s, b) => s + (b.analytics.conversions || 0), 0);
    const totalSpent       = boosts.reduce((s, b) => s + (b.payment.amount        || 0), 0);
    const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : 0;
    const convRate = totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      stats: { totalImpressions, totalClicks, totalConversions, totalSpent, ctr, convRate }
    });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/boosts/:id/track ─────────────────────────────────────────────
// @desc  Tracker une impression ou un clic (appelé par le frontend)
// @body  { event: 'impression' | 'click' | 'conversion' }
// @access Public (rate-limited)
exports.trackEvent = async (req, res, next) => {
  try {
    const { event } = req.body;
    const allowed = ['impression', 'click', 'conversion'];
    if (!allowed.includes(event)) {
      return res.status(400).json({ success: false, message: 'Event invalide' });
    }
    const field = `analytics.${event}s`;
    await Boost.findOneAndUpdate(
      { _id: req.params.id, status: 'active', expiresAt: { $gt: new Date() } },
      { $inc: { [field]: 1 } }
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ─── Admin endpoints ──────────────────────────────────────────────────────────

// GET /api/boosts/admin/all
exports.adminGetAll = async (req, res, next) => {
  try {
    autoExpire();
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};

    const [boosts, total, globalStats] = await Promise.all([
      Boost.find(filter)
        .populate('vendor',  'name email shopName phone')
        .populate('product', 'nameFr images')
        .sort('-createdAt')
        .limit(limit * 1)
        .skip((page - 1) * limit),
      Boost.countDocuments(filter),
      Boost.getAdminStats()
    ]);

    res.json({
      success: true,
      boosts,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      globalStats
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/boosts/:id/activate  — Admin active le boost après confirmation du virement
exports.adminActivate = async (req, res, next) => {
  try {
    const { note } = req.body;
    const boost = await Boost.findById(req.params.id).populate('vendor', 'name email');
    if (!boost) return res.status(404).json({ success: false, message: 'Boost introuvable' });
    if (boost.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Statut actuel : ${boost.status}. Seuls les boosts "pending" peuvent être activés.` });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + boost.durationHours * 60 * 60 * 1000);

    boost.status       = 'active';
    boost.activatedAt  = now;
    boost.expiresAt    = expiresAt;
    boost.adminNote    = note || '';
    boost.payment.confirmedAt = now;
    boost.payment.confirmedBy = req.user._id;

    await boost.save();

    // Mettre à jour le champ boostActive sur le vendeur (pour queries rapides)
    await User.findByIdAndUpdate(boost.vendor._id, {
      'stats.boostActive': true,
      'stats.boostExpiresAt': expiresAt
    }).catch(() => {});

    res.json({ success: true, message: `Boost activé jusqu'au ${expiresAt.toLocaleDateString('fr-FR')}`, boost });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/boosts/:id/cancel  — Admin ou vendeur annule
exports.cancelBoost = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const boost = await Boost.findById(req.params.id);
    if (!boost) return res.status(404).json({ success: false, message: 'Boost introuvable' });

    const isAdmin = req.user.role === 'admin';
    const isOwner = boost.vendor.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner) return res.status(403).json({ success: false, message: 'Non autorisé' });

    // Vendeur peut annuler uniquement si pending
    if (!isAdmin && boost.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Seuls les boosts en attente peuvent être annulés par le vendeur' });
    }

    boost.status = 'cancelled';
    boost.cancelReason = reason || '';
    await boost.save();

    res.json({ success: true, message: 'Boost annulé', boost });
  } catch (error) {
    next(error);
  }
};
