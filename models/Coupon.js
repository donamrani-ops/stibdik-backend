// Model: Coupon (Codes promotionnels)
const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({

  // ── Identification ──────────────────────────────────────────────────────────
  code: {
    type: String,
    required: [true, 'Le code est obligatoire'],
    unique: true,
    uppercase: true,
    trim: true,
    match: [/^[A-Z0-9_-]{3,20}$/, 'Le code doit contenir 3-20 caractères alphanumériques']
  },
  description: { type: String, maxlength: 200 },

  // ── Type de réduction ───────────────────────────────────────────────────────
  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true
  },
  discountValue: {
    type: Number,
    required: true,
    min: [0, 'La valeur doit être positive'],
    validate: {
      validator(v) {
        if (this.discountType === 'percentage') return v > 0 && v <= 100;
        return v > 0;
      },
      message: 'Valeur invalide pour ce type de réduction'
    }
  },

  // ── Conditions d'utilisation ────────────────────────────────────────────────
  minCartAmount:  { type: Number, default: 0, min: 0 },  // panier minimum
  maxDiscount:    { type: Number, default: null },        // plafond réduction (% uniquement)
  startDate:      { type: Date, default: Date.now },
  endDate:        { type: Date, default: null },          // null = pas de date limite
  maxUses:        { type: Number, default: null },        // null = illimité
  maxUsesPerUser: { type: Number, default: 1 },

  // Ciblage produits / catégories (optionnel)
  restrictToCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  restrictToProducts:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

  // ── Compteurs ───────────────────────────────────────────────────────────────
  usedCount: { type: Number, default: 0 },

  // ── Statut ──────────────────────────────────────────────────────────────────
  isActive: { type: Boolean, default: true },

  // ── Créateur ────────────────────────────────────────────────────────────────
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true });

couponSchema.index({ code: 1 });
couponSchema.index({ isActive: 1, endDate: 1 });

// ── Méthode : valider le coupon pour un panier donné ─────────────────────────
couponSchema.methods.validate = async function(cartAmount, userId, cartProductIds = []) {
  const now = new Date();

  if (!this.isActive)            return { valid: false, reason: 'Ce coupon est inactif' };
  if (this.startDate > now)      return { valid: false, reason: 'Ce coupon n\'est pas encore actif' };
  if (this.endDate && this.endDate < now) return { valid: false, reason: 'Ce coupon a expiré' };
  if (this.maxUses && this.usedCount >= this.maxUses) return { valid: false, reason: 'Ce coupon a atteint son nombre maximum d\'utilisations' };
  if (cartAmount < this.minCartAmount) return { valid: false, reason: `Panier minimum requis : ${this.minCartAmount} DH` };

  // Vérifier limite par user
  if (userId) {
    const CouponUsage = mongoose.model('CouponUsage');
    const userUses = await CouponUsage.countDocuments({ coupon: this._id, user: userId });
    if (userUses >= this.maxUsesPerUser) return { valid: false, reason: 'Vous avez déjà utilisé ce coupon' };
  }

  // Vérifier restrictions produits/catégories (si définies)
  if (this.restrictToProducts.length > 0 || this.restrictToCategories.length > 0) {
    // Simplified: si restriction active, on valide au niveau checkout
    // (vérification complète dans le controller avec le panier populé)
  }

  return { valid: true };
};

// ── Méthode : calculer la réduction ─────────────────────────────────────────
couponSchema.methods.calculateDiscount = function(cartAmount) {
  let discount = 0;
  if (this.discountType === 'percentage') {
    discount = (cartAmount * this.discountValue) / 100;
    if (this.maxDiscount) discount = Math.min(discount, this.maxDiscount);
  } else {
    discount = this.discountValue;
  }
  // Ne jamais rendre le total négatif
  return Math.min(discount, cartAmount);
};

module.exports = mongoose.model('Coupon', couponSchema);
