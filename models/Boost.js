// Model: Boost (Mise en avant vendeur)
const mongoose = require('mongoose');

// ─── Plans prédéfinis (référence statique, pas en DB) ────────────────────────
// Stockés ici pour cohérence backend/frontend
const BOOST_PLANS = {
  starter_24h: {
    id: 'starter_24h',
    name: 'Starter',
    nameAr: 'ستارتر',
    duration: 24,        // heures
    durationLabel: '24h',
    price: 29,           // DH
    features: ['badge_boosted', 'priority_search'],
    rankBonus: 50,       // points de ranking supplémentaires
    popular: false
  },
  pro_7d: {
    id: 'pro_7d',
    name: 'Pro',
    nameAr: 'برو',
    duration: 7 * 24,
    durationLabel: '7 jours',
    price: 99,
    features: ['badge_boosted', 'priority_search', 'homepage_highlight', 'category_top'],
    rankBonus: 120,
    popular: true
  },
  premium_30d: {
    id: 'premium_30d',
    name: 'Premium',
    nameAr: 'بريميوم',
    duration: 30 * 24,
    durationLabel: '30 jours',
    price: 299,
    features: ['badge_boosted', 'priority_search', 'homepage_highlight', 'category_top', 'featured_vendor'],
    rankBonus: 250,
    popular: false
  }
};

// ─── Schéma principal ────────────────────────────────────────────────────────
const boostSchema = new mongoose.Schema({

  // Qui et quoi est boosté
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // Si null → boost profil/boutique. Si renseigné → boost produit spécifique
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null,
    index: true
  },
  targetType: {
    type: String,
    enum: ['profile', 'product'],
    required: true,
    default: 'profile'
  },

  // Plan choisi
  planId: {
    type: String,
    enum: Object.keys(BOOST_PLANS),
    required: true
  },
  planSnapshot: {
    name: String,
    price: Number,
    duration: Number,
    rankBonus: Number,
    features: [String]
  },

  // Durée et timing
  durationHours: { type: Number, required: true },
  requestedAt:   { type: Date, default: Date.now },
  activatedAt:   { type: Date, default: null },
  expiresAt:     { type: Date, default: null, index: true },

  // Statut workflow: pending → active → expired | cancelled
  status: {
    type: String,
    enum: ['pending', 'active', 'expired', 'cancelled'],
    default: 'pending',
    index: true
  },

  // Paiement (virement hors-plateforme)
  payment: {
    amount:    { type: Number, required: true },
    currency:  { type: String, default: 'MAD' },
    method:    { type: String, default: 'bank_transfer' },
    reference: { type: String },            // référence virement fournie par le vendeur
    proofUrl:  { type: String },            // URL justificatif Cloudinary (optionnel)
    confirmedAt: { type: Date },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },

  // Analytics (compteurs simples)
  analytics: {
    impressions:  { type: Number, default: 0 },
    clicks:       { type: Number, default: 0 },
    conversions:  { type: Number, default: 0 }  // ventes pendant le boost
  },

  // Notes admin
  adminNote: { type: String },
  cancelReason: { type: String }

}, { timestamps: true });

// ─── Indexes composés ─────────────────────────────────────────────────────────
boostSchema.index({ vendor: 1, status: 1 });
boostSchema.index({ status: 1, expiresAt: 1 });
boostSchema.index({ product: 1, status: 1 });

// ─── Méthodes d'instance ──────────────────────────────────────────────────────
boostSchema.methods.isActive = function () {
  return this.status === 'active' && this.expiresAt > new Date();
};

// ─── Méthodes statiques ───────────────────────────────────────────────────────

// Vérifier si un vendeur a un boost actif (profil ou produit)
boostSchema.statics.getActiveVendorBoost = async function (vendorId) {
  return this.findOne({
    vendor: vendorId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  }).sort({ 'planSnapshot.rankBonus': -1 });
};

// Vérifier si un produit spécifique est boosté
boostSchema.statics.getActiveProductBoost = async function (productId) {
  return this.findOne({
    product: productId,
    targetType: 'product',
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
};

// Expirer automatiquement les boosts périmés (appelé par un cron ou à chaque requête)
boostSchema.statics.expireOld = async function () {
  const result = await this.updateMany(
    { status: 'active', expiresAt: { $lt: new Date() } },
    { $set: { status: 'expired' } }
  );
  return result.modifiedCount;
};

// Stats globales pour admin
boostSchema.statics.getAdminStats = async function () {
  const [totalRevenue, active, pending, expired] = await Promise.all([
    this.aggregate([
      { $match: { status: { $in: ['active', 'expired'] } } },
      { $group: { _id: null, total: { $sum: '$payment.amount' } } }
    ]),
    this.countDocuments({ status: 'active', expiresAt: { $gt: new Date() } }),
    this.countDocuments({ status: 'pending' }),
    this.countDocuments({ status: 'expired' })
  ]);
  return {
    totalRevenue: totalRevenue[0]?.total || 0,
    activeBoosts: active,
    pendingBoosts: pending,
    expiredBoosts: expired
  };
};

const Boost = mongoose.model('Boost', boostSchema);
Boost.PLANS = BOOST_PLANS;
module.exports = Boost;
