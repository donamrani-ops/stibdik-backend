// Model: CouponUsage — journal de chaque utilisation
const mongoose = require('mongoose');

const couponUsageSchema = new mongoose.Schema({
  coupon:        { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
  order:         { type: mongoose.Schema.Types.ObjectId, ref: 'Order',  required: true },
  discountAmount:{ type: Number, required: true },
  cartTotal:     { type: Number, required: true },
  finalTotal:    { type: Number, required: true }
}, { timestamps: true });

couponUsageSchema.index({ coupon: 1, user: 1 });

module.exports = mongoose.model('CouponUsage', couponUsageSchema);
