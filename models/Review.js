// Model: Review (Avis produit/vendeur après achat vérifié)
const mongoose = require('mongoose');

// ─── Sous-schéma : sous-notes ────────────────────────────────────────────────
const subRatingsSchema = new mongoose.Schema({
  communication:  { type: Number, min: 1, max: 5 },
  conformity:     { type: Number, min: 1, max: 5 }, // Conformité produit
  delivery:       { type: Number, min: 1, max: 5 }, // Rapidité livraison
  packaging:      { type: Number, min: 1, max: 5 }  // Emballage
}, { _id: false });

// ─── Sous-schéma : like "Avis utile" ────────────────────────────────────────
const likeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

// ─── Sous-schéma : réponse vendeur ──────────────────────────────────────────
const vendorReplySchema = new mongoose.Schema({
  text:      { type: String, required: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
}, { _id: false });

// ─── Sous-schéma : signalement ──────────────────────────────────────────────
const reportSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason:    { type: String, enum: ['spam', 'inappropriate', 'fake', 'offensive', 'other'], required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

// ─── Schéma principal ────────────────────────────────────────────────────────
const reviewSchema = new mongoose.Schema({

  // ── Relations ──────────────────────────────────────────────────────────────
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: [true, 'La commande est obligatoire'],
    index: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Le produit est obligatoire'],
    index: true
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Le vendeur est obligatoire'],
    index: true
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'L\'auteur est obligatoire'],
    index: true
  },

  // ── Note principale ────────────────────────────────────────────────────────
  rating: {
    type: Number,
    required: [true, 'La note est obligatoire'],
    min: [1, 'La note minimum est 1'],
    max: [5, 'La note maximum est 5'],
    validate: {
      validator: v => Number.isInteger(v) || (v * 2) === Math.round(v * 2),
      message: 'La note doit être un entier ou demi-entier (ex: 3, 3.5, 4)'
    }
  },

  // ── Sous-notes ─────────────────────────────────────────────────────────────
  subRatings: {
    type: subRatingsSchema,
    default: () => ({})
  },

  // ── Contenu ────────────────────────────────────────────────────────────────
  comment: {
    type: String,
    required: [true, 'Le commentaire est obligatoire'],
    minlength: [10, 'Le commentaire doit faire au moins 10 caractères'],
    maxlength: [1000, 'Le commentaire ne peut pas dépasser 1000 caractères'],
    trim: true
  },

  // ── Hash pour détecter les reviews identiques (anti-spam) ─────────────────
  contentHash: {
    type: String,
    index: true
  },

  // ── Photos du produit reçu ─────────────────────────────────────────────────
  photos: [{
    url:      { type: String, required: true },
    publicId: { type: String, required: true }
  }],

  // ── Badge "achat vérifié" (toujours true car validé à la création) ─────────
  verifiedPurchase: {
    type: Boolean,
    default: true
  },

  // ── Snapshot produit (résilience si produit supprimé) ─────────────────────
  productSnapshot: {
    nameFr: String,
    nameAr: String,
    image:  String
  },

  // ── Interactions ──────────────────────────────────────────────────────────
  likes: {
    type: [likeSchema],
    default: []
  },

  vendorReply: {
    type: vendorReplySchema,
    default: null
  },

  reports: {
    type: [reportSchema],
    default: []
  },

  // ── Modération ─────────────────────────────────────────────────────────────
  isHidden: {
    type: Boolean,
    default: false // masqué par admin si signalement validé
  },
  moderationNote: String

}, {
  timestamps: true
});

// ─── Index composés ──────────────────────────────────────────────────────────
// Un seul avis par commande (contrainte forte)
reviewSchema.index({ order: 1 }, { unique: true });
// Pour les requêtes "avis de ce produit" + "avis sur ce vendeur"
reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ vendor: 1, createdAt: -1 });
reviewSchema.index({ reviewer: 1 });

// ─── Méthodes statiques ───────────────────────────────────────────────────────

// Calculer les stats d'un produit (note moyenne, distribution, sous-notes)
reviewSchema.statics.getProductStats = async function(productId) {
  const result = await this.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId), isHidden: false } },
    { $group: {
      _id: null,
      count:       { $sum: 1 },
      avgRating:   { $avg: '$rating' },
      avgComm:     { $avg: '$subRatings.communication' },
      avgConform:  { $avg: '$subRatings.conformity' },
      avgDelivery: { $avg: '$subRatings.delivery' },
      avgPackaging:{ $avg: '$subRatings.packaging' },
      dist5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
      dist4: { $sum: { $cond: [{ $and: [{ $gte: ['$rating', 4] }, { $lt: ['$rating', 5] }] }, 1, 0] } },
      dist3: { $sum: { $cond: [{ $and: [{ $gte: ['$rating', 3] }, { $lt: ['$rating', 4] }] }, 1, 0] } },
      dist2: { $sum: { $cond: [{ $and: [{ $gte: ['$rating', 2] }, { $lt: ['$rating', 3] }] }, 1, 0] } },
      dist1: { $sum: { $cond: [{ $lt: ['$rating', 2] }, 1, 0] } }
    }}
  ]);
  if (!result.length) return { count: 0, avgRating: 0, positivePercent: 0, distribution: {5:0,4:0,3:0,2:0,1:0}, subRatings: {} };
  const r = result[0];
  return {
    count:           r.count,
    avgRating:       Math.round(r.avgRating * 10) / 10,
    positivePercent: r.count > 0 ? Math.round(((r.dist5 + r.dist4) / r.count) * 100) : 0,
    distribution:    { 5: r.dist5, 4: r.dist4, 3: r.dist3, 2: r.dist2, 1: r.dist1 },
    subRatings: {
      communication: r.avgComm   ? Math.round(r.avgComm   * 10) / 10 : null,
      conformity:    r.avgConform ? Math.round(r.avgConform * 10) / 10 : null,
      delivery:      r.avgDelivery? Math.round(r.avgDelivery * 10) / 10 : null,
      packaging:     r.avgPackaging?Math.round(r.avgPackaging* 10) / 10 : null
    }
  };
};

// Calculer les stats d'un vendeur
reviewSchema.statics.getVendorStats = async function(vendorId) {
  const result = await this.aggregate([
    { $match: { vendor: new mongoose.Types.ObjectId(vendorId), isHidden: false } },
    { $group: {
      _id: null,
      count:       { $sum: 1 },
      avgRating:   { $avg: '$rating' },
      avgComm:     { $avg: '$subRatings.communication' },
      avgConform:  { $avg: '$subRatings.conformity' },
      avgDelivery: { $avg: '$subRatings.delivery' },
      avgPackaging:{ $avg: '$subRatings.packaging' },
      dist5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
      dist4: { $sum: { $cond: [{ $and: [{ $gte: ['$rating', 4] }, { $lt: ['$rating', 5] }] }, 1, 0] } },
      dist3: { $sum: { $cond: [{ $and: [{ $gte: ['$rating', 3] }, { $lt: ['$rating', 4] }] }, 1, 0] } },
      dist2: { $sum: { $cond: [{ $and: [{ $gte: ['$rating', 2] }, { $lt: ['$rating', 3] }] }, 1, 0] } },
      dist1: { $sum: { $cond: [{ $lt: ['$rating', 2] }, 1, 0] } }
    }}
  ]);
  if (!result.length) return { count: 0, avgRating: 0, positivePercent: 0, distribution: {5:0,4:0,3:0,2:0,1:0}, subRatings: {} };
  const r = result[0];
  return {
    count:           r.count,
    avgRating:       Math.round(r.avgRating * 10) / 10,
    positivePercent: r.count > 0 ? Math.round(((r.dist5 + r.dist4) / r.count) * 100) : 0,
    distribution:    { 5: r.dist5, 4: r.dist4, 3: r.dist3, 2: r.dist2, 1: r.dist1 },
    subRatings: {
      communication: r.avgComm    ? Math.round(r.avgComm    * 10) / 10 : null,
      conformity:    r.avgConform  ? Math.round(r.avgConform  * 10) / 10 : null,
      delivery:      r.avgDelivery ? Math.round(r.avgDelivery * 10) / 10 : null,
      packaging:     r.avgPackaging? Math.round(r.avgPackaging* 10) / 10 : null
    }
  };
};

module.exports = mongoose.model('Review', reviewSchema);
