// Model: Coupon (codes promotionnels)
const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({

  // ── Identifiant ────────────────────────────────────────────────────────────
  code: {
    type: String,
    required: [true, 'Le code est obligatoire'],
    unique: true,
    uppercase: true,
    trim: true,
    match: [/^[A-Z0-9_-]{3,20}$/, 'Le code doit faire 3-20 caractères alphanumériques']
  },

  description: { type: String, maxlength: 200 },

  // ── Type de réduction ──────────────────────────────────────────────────────
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: [0.01, 'La réduction doit être positive'],
    validate: {
      validator(v) {
        if (this.discountType === 'percentage') return v > 0 && v <= 100;
        return v > 0;
      },
      message: 'Valeur de réduction invalide'
    }
  },

  // ── Conditions ─────────────────────────────────────────────────────────────
  minOrderAmount:  { type: Number, default: 0 },   // panier minimum en DH
  maxUsesTotal:    { type: Number, default: null }, // null = illimité
  maxUsesPerUser:  { type: Number, default: 1 },
  startsAt:        { type: Date,   default: Date.now },
  expiresAt:       { type: Date,   default: null },  // null = pas d'expiration

  // Ciblage optionnel (null = tous)
  targetCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  targetProducts:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product'  }],

  // ── Compteurs ──────────────────────────────────────────────────────────────
  usedCount: { type: Number, default: 0 },

  // ── Statut ─────────────────────────────────────────────────────────────────
  isActive: { type: Boolean, default: true },

  // ── Créé par ───────────────────────────────────────────────────────────────
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true });

// ─── Indexes ─────────────────────────────────────────────────────────────────
couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1, expiresAt: 1 });

// ─── Méthode de validation complète ──────────────────────────────────────────
couponSchema.methods.validate = async function(userId, cartTotal, cartItems = []) {
  const now = new Date();

  if (!this.isActive)
    return { valid: false, reason: 'Ce coupon est désactivé' };

  if (this.startsAt > now)
    return { valid: false, reason: 'Ce coupon n\'est pas encore actif' };

  if (this.expiresAt && this.expiresAt < now)
    return { valid: false, reason: 'Ce coupon a expiré' };

  if (this.maxUsesTotal !== null && this.usedCount >= this.maxUsesTotal)
    return { valid: false, reason: 'Ce coupon a atteint sa limite d\'utilisation' };

  if (cartTotal < this.minOrderAmount)
    return { valid: false, reason: `Panier minimum requis : ${this.minOrderAmount} DH` };

  // Vérifier les utilisations par user
  const CouponUsage = mongoose.model('CouponUsage');
  const userUses = await CouponUsage.countDocuments({ coupon: this._id, user: userId });
  if (userUses >= this.maxUsesPerUser)
    return { valid: false, reason: 'Vous avez déjà utilisé ce coupon' };

  // Vérifier le ciblage produits/catégories
  if (this.targetProducts.length > 0 || this.targetCategories.length > 0) {
    const targetProductIds = this.targetProducts.map(String);
    const targetCatIds     = this.targetCategories.map(String);
    const eligible = cartItems.some(item => {
      const pid = String(item.product || item._id);
      const cid = String(item.category || item.categoryId || '');
      return targetProductIds.includes(pid) || targetCatIds.includes(cid);
    });
    if (!eligible)
      return { valid: false, reason: 'Ce coupon ne s\'applique pas aux articles de votre panier' };
  }

  return { valid: true };
};

// ─── Calcul du montant de réduction ──────────────────────────────────────────
couponSchema.methods.computeDiscount = function(cartTotal) {
  let discount = 0;
  if (this.discountType === 'percentage') {
    discount = (cartTotal * this.discountValue) / 100;
  } else {
    discount = this.discountValue;
  }
  // Ne jamais rendre le total négatif
  return Math.min(discount, cartTotal);
};

module.exports = mongoose.model('Coupon', couponSchema);
