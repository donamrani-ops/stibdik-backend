// Model: CouponUsage (Journal des utilisations de coupons)
const mongoose = require('mongoose');

const couponUsageSchema = new mongoose.Schema({
  coupon:        { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
  order:         { type: mongoose.Schema.Types.ObjectId, ref: 'Order',  required: true },
  discountAmount:{ type: Number, required: true },
  cartAmount:    { type: Number, required: true },
  usedAt:        { type: Date, default: Date.now }
}, { timestamps: false });

// Un user ne peut pas utiliser le même coupon sur la même commande deux fois
couponUsageSchema.index({ coupon: 1, order: 1 }, { unique: true });

module.exports = mongoose.model('CouponUsage', couponUsageSchema);
