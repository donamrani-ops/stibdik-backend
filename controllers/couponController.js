// Controller: Coupons
const Coupon      = require('../models/Coupon');
const CouponUsage = require('../models/CouponUsage');
const Order       = require('../models/Order');

// ─── GET /api/coupons/validate?code=XXX&amount=YYY ───────────────────────────
// @desc  Valider un coupon (public mais user optionnel pour check limite/user)
exports.validateCoupon = async (req, res, next) => {
  try {
    const { code, amount = 0 } = req.query;
    if (!code) return res.status(400).json({ success: false, message: 'Code requis' });

    const coupon = await Coupon.findOne({ code: code.trim().toUpperCase() });
    if (!coupon) return res.status(404).json({ success: false, message: 'Code invalide ❌' });

    const cartAmount = parseFloat(amount) || 0;
    const userId = req.user?._id;
    const result = await coupon.validate(cartAmount, userId);

    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.reason });
    }

    const discount = coupon.calculateDiscount(cartAmount);
    const finalAmount = cartAmount - discount;

    res.json({
      success: true,
      message: `Coupon appliqué ✔ ${coupon.discountType === 'percentage' ? `-${coupon.discountValue}%` : `-${coupon.discountValue} DH`}`,
      coupon: {
        _id:          coupon._id,
        code:         coupon.code,
        description:  coupon.description,
        discountType: coupon.discountType,
        discountValue:coupon.discountValue
      },
      discount:    Math.round(discount * 100) / 100,
      finalAmount: Math.round(finalAmount * 100) / 100
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/coupons/apply ─────────────────────────────────────────────────
// @desc  Appliquer un coupon à une commande (appelé après création de commande)
// @body  { couponCode, orderId }
exports.applyCoupon = async (req, res, next) => {
  try {
    const { couponCode, orderId } = req.body;
    if (!couponCode || !orderId) {
      return res.status(400).json({ success: false, message: 'couponCode et orderId requis' });
    }

    const [coupon, order] = await Promise.all([
      Coupon.findOne({ code: couponCode.trim().toUpperCase() }),
      Order.findById(orderId)
    ]);

    if (!coupon) return res.status(404).json({ success: false, message: 'Code invalide ❌' });
    if (!order)  return res.status(404).json({ success: false, message: 'Commande introuvable' });
    if (order.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }
    if (order.coupon) {
      return res.status(409).json({ success: false, message: 'Un coupon est déjà appliqué à cette commande' });
    }

    const result = await coupon.validate(order.totalAmount, req.user._id);
    if (!result.valid) return res.status(400).json({ success: false, message: result.reason });

    const discount = coupon.calculateDiscount(order.totalAmount);
    const newTotal = Math.round((order.totalAmount - discount) * 100) / 100;

    // Appliquer à la commande + journaliser
    await Promise.all([
      Order.findByIdAndUpdate(orderId, {
        coupon: coupon._id,
        couponCode: coupon.code,
        discountAmount: discount,
        totalAmount: newTotal
      }),
      CouponUsage.create({
        coupon: coupon._id,
        user:   req.user._id,
        order:  orderId,
        discountAmount: discount,
        cartAmount: order.totalAmount
      }),
      Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } })
    ]);

    res.json({
      success: true,
      message: `Coupon appliqué ✔ -${discount} DH`,
      discount,
      newTotal
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Ce coupon a déjà été utilisé sur cette commande' });
    }
    next(error);
  }
};

// ─── Admin CRUD ───────────────────────────────────────────────────────────────

// GET /api/coupons/admin/all
exports.adminGetAll = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, active } = req.query;
    const filter = {};
    if (active !== undefined) filter.isActive = active === 'true';

    const [coupons, total] = await Promise.all([
      Coupon.find(filter).sort('-createdAt').limit(limit * 1).skip((page - 1) * limit),
      Coupon.countDocuments(filter)
    ]);

    // Stats globales
    const totalUsages = await CouponUsage.countDocuments();
    const totalSavings = await CouponUsage.aggregate([
      { $group: { _id: null, total: { $sum: '$discountAmount' } } }
    ]);

    res.json({
      success: true, coupons, total,
      page: parseInt(page), pages: Math.ceil(total / limit),
      globalStats: {
        totalUsages,
        totalSavings: totalSavings[0]?.total || 0
      }
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/coupons/admin
exports.adminCreate = async (req, res, next) => {
  try {
    const coupon = await Coupon.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, message: 'Coupon créé', coupon });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Ce code existe déjà' });
    }
    next(error);
  }
};

// PUT /api/coupons/admin/:id
exports.adminUpdate = async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon introuvable' });
    res.json({ success: true, coupon });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/coupons/admin/:id
exports.adminDelete = async (req, res, next) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Coupon supprimé' });
  } catch (error) {
    next(error);
  }
};

// GET /api/coupons/admin/:id/stats
exports.adminStats = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon introuvable' });

    const usages = await CouponUsage.find({ coupon: req.params.id })
      .populate('user', 'name email')
      .populate('order', 'orderNumber totalAmount')
      .sort('-usedAt')
      .limit(50);

    const totalSavings = usages.reduce((s, u) => s + u.discountAmount, 0);

    res.json({ success: true, coupon, usages, totalSavings });
  } catch (error) {
    next(error);
  }
};
