// controllers/referralController.js
const User   = require('../models/User');
const Coupon = require('../models/Coupon');

// Récompenses du parrainage (en DH)
const REFERRAL_REWARD_REFERRER = 50; // pour le parrain
const REFERRAL_REWARD_REFEREE  = 50; // pour le filleul

// ── GET /api/referral/me ──────────────────────────────────────────────────────
// Retourne le code de parrainage et les stats de l'utilisateur
exports.getMyReferral = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    // Générer le code s'il n'existe pas encore (anciens comptes)
    if (!user.referralCode) {
      const base = (user.name || 'STB').replace(/[^A-Za-z]/g, '').toUpperCase().substring(0, 5) || 'STB';
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      user.referralCode = base + rand;
      await user.save({ validateBeforeSave: false });
    }

    // Lister les filleuls
    const referrals = await User.find({ referredBy: user._id })
      .select('name createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      rewardPerReferral: REFERRAL_REWARD_REFERRER,
      totalEarned: (user.referralCount || 0) * REFERRAL_REWARD_REFERRER,
      referrals: referrals.map(r => ({
        name: r.name,
        date: r.createdAt,
      })),
    });
  } catch (error) { next(error); }
};

// ── POST /api/referral/apply ──────────────────────────────────────────────────
// Applique un code de parrainage (appelé après l'inscription)
exports.applyReferral = async (req, res, next) => {
  try {
    const { referralCode } = req.body;
    if (!referralCode) {
      return res.status(400).json({ message: 'Code de parrainage requis' });
    }

    const referee = await User.findById(req.user._id);
    if (!referee) return res.status(404).json({ message: 'Utilisateur introuvable' });

    // Vérifier que le filleul n'a pas déjà été parrainé
    if (referee.referredBy) {
      return res.status(400).json({ message: 'Vous avez déjà utilisé un code de parrainage' });
    }

    // Trouver le parrain
    const referrer = await User.findOne({ referralCode: referralCode.toUpperCase().trim() });
    if (!referrer) {
      return res.status(404).json({ message: 'Code de parrainage invalide' });
    }

    // Empêcher l'auto-parrainage
    if (String(referrer._id) === String(referee._id)) {
      return res.status(400).json({ message: 'Vous ne pouvez pas utiliser votre propre code' });
    }

    // Lier le filleul au parrain
    referee.referredBy = referrer._id;
    await referee.save({ validateBeforeSave: false });

    // Incrémenter le compteur du parrain
    referrer.referralCount = (referrer.referralCount || 0) + 1;
    await referrer.save({ validateBeforeSave: false });

    // Créer les coupons de récompense pour les deux parties
    const now = new Date();
    const expiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 jours

    // Coupon filleul
    const refereeCoupon = await Coupon.create({
      code: `BIENVENUE${referee._id.toString().slice(-5).toUpperCase()}`,
      description: 'Bonus de bienvenue parrainage',
      discountType: 'fixed',
      discountValue: REFERRAL_REWARD_REFEREE,
      minOrderAmount: 0,
      maxUsesPerUser: 1,
      isActive: true,
      startsAt: now,
      expiresAt: expiry,
    }).catch(() => null);

    // Coupon parrain
    const referrerCoupon = await Coupon.create({
      code: `MERCI${referrer._id.toString().slice(-5).toUpperCase()}${referrer.referralCount}`,
      description: `Récompense parrainage (${referrer.referralCount} filleul${referrer.referralCount > 1 ? 's' : ''})`,
      discountType: 'fixed',
      discountValue: REFERRAL_REWARD_REFERRER,
      minOrderAmount: 0,
      maxUsesPerUser: 1,
      isActive: true,
      startsAt: now,
      expiresAt: expiry,
    }).catch(() => null);

    res.json({
      success: true,
      message: `Parrainage validé ! Vous gagnez ${REFERRAL_REWARD_REFEREE} DH`,
      reward: REFERRAL_REWARD_REFEREE,
      refereeCoupon: refereeCoupon ? refereeCoupon.code : null,
    });
  } catch (error) { next(error); }
};

// ── GET /api/referral/validate/:code ──────────────────────────────────────────
// Vérifie qu'un code existe (avant inscription, public)
exports.validateCode = async (req, res, next) => {
  try {
    const code = (req.params.code || '').toUpperCase().trim();
    const referrer = await User.findOne({ referralCode: code }).select('name').lean();

    if (!referrer) {
      return res.json({ valid: false });
    }
    res.json({
      valid: true,
      referrerName: referrer.name,
      reward: REFERRAL_REWARD_REFEREE,
    });
  } catch (error) { next(error); }
};
