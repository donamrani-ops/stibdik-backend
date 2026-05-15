// Controller: Coupons
const Coupon      = require('../models/Coupon');
const CouponUsage = require('../models/CouponUsage');
const Order       = require('../models/Order');

// ─── GET /api/coupons/validate?code=XXX&total=YYY ────────────────────────────
exports.validateCoupon = async (req, res, next) => {
  try {
    const { code, total = 0, items = '[]' } = req.query;
    if (!code) return res.status(400).json({ success: false, message: 'Code requis' });

    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (!coupon) return res.status(404).json({ success: false, message: 'Code invalide ❌' });

    let cartItems = [];
    try { cartItems = JSON.parse(decodeURIComponent(items)); } catch {}

    const result = await coupon.validate(req.user._id, parseFloat(total), cartItems);
    if (!result.valid) return res.status(400).json({ success: false, message: result.reason });

    const discountAmount = coupon.computeDiscount(parseFloat(total));
    const finalTotal     = parseFloat(total) - discountAmount;

    res.json({
      success: true,
      coupon: { _id: coupon._id, code: coupon.code, description: coupon.description, discountType: coupon.discountType, discountValue: coupon.discountValue },
      discountAmount: Math.round(discountAmount * 100) / 100,
      finalTotal:     Math.round(finalTotal     * 100) / 100,
      message: coupon.discountType === 'percentage' ? `Coupon appliqué ✅ -${coupon.discountValue}%` : `Coupon appliqué ✅ -${coupon.discountValue} DH`
    });
  } catch (error) { next(error); }
};

// ─── POST /api/coupons/apply ─────────────────────────────────────────────────
exports.applyCoupon = async (req, res, next) => {
  try {
    const { code, orderId, cartTotal, cartItems = [] } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (!coupon) return res.status(404).json({ success: false, message: 'Code invalide' });

    const result = await coupon.validate(req.user._id, cartTotal, cartItems);
    if (!result.valid) return res.status(400).json({ success: false, message: result.reason });

    const discountAmount = coupon.computeDiscount(cartTotal);
    const finalTotal     = cartTotal - discountAmount;

    await Promise.all([
      CouponUsage.create({ coupon: coupon._id, user: req.user._id, order: orderId, discountAmount: Math.round(discountAmount*100)/100, cartTotal, finalTotal: Math.round(finalTotal*100)/100 }),
      Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } }),
      Order.findByIdAndUpdate(orderId, { coupon: coupon._id, couponCode: coupon.code, discountAmount: Math.round(discountAmount*100)/100, totalAmount: Math.round(finalTotal*100)/100 })
    ]);

    res.json({ success: true, discountAmount: Math.round(discountAmount*100)/100, finalTotal: Math.round(finalTotal*100)/100 });
  } catch (error) { next(error); }
};

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

exports.adminGetAll = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, active } = req.query;
    const filter = active !== undefined ? { isActive: active === 'true' } : {};
    const [coupons, total, usageStats] = await Promise.all([
      Coupon.find(filter).populate('createdBy', 'name email').sort('-createdAt').limit(limit*1).skip((page-1)*limit),
      Coupon.countDocuments(filter),
      CouponUsage.aggregate([{ $group: { _id: null, totalUsages: { $sum: 1 }, totalDiscount: { $sum: '$discountAmount' } } }])
    ]);
    res.json({ success: true, coupons, total, page: parseInt(page), pages: Math.ceil(total/limit), globalStats: { totalUsages: usageStats[0]?.totalUsages||0, totalDiscount: usageStats[0]?.totalDiscount||0 } });
  } catch (error) { next(error); }
};

exports.adminCreate = async (req, res, next) => {
  try {
    const coupon = await Coupon.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, coupon });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: `Le code "${req.body.code?.toUpperCase()}" existe déjà` });
    next(error);
  }
};

exports.adminUpdate = async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon introuvable' });
    res.json({ success: true, coupon });
  } catch (error) { next(error); }
};

exports.adminDelete = async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon introuvable' });
    res.json({ success: true, message: 'Coupon supprimé' });
  } catch (error) { next(error); }
};

exports.adminToggle = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon introuvable' });
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    res.json({ success: true, isActive: coupon.isActive });
  } catch (error) { next(error); }
};

exports.adminGetUsages = async (req, res, next) => {
  try {
    const usages = await CouponUsage.find({ coupon: req.params.id }).populate('user', 'name email').populate('order', 'orderNumber totalAmount').sort('-createdAt').limit(50);
    res.json({ success: true, usages });
  } catch (error) { next(error); }
};
