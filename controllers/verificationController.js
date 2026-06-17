// controllers/verificationController.js
const User = require('../models/User');

const PRO_PRICE_MONTHLY = 49;  // DH/mois
const PRO_PRICE_YEARLY  = 490; // DH/an (2 mois offerts)

// ── POST /api/verification/submit ─────────────────────────────────────────────
// Le vendeur soumet sa photo de CIN (recto/verso) pour vérification
exports.submitVerification = async (req, res, next) => {
  try {
    const { idCardFront, idCardBack } = req.body;
    if (!idCardFront) {
      return res.status(400).json({ message: 'Photo de la CIN (recto) requise' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    if (user.role !== 'vendor' && user.role !== 'admin') {
      return res.status(403).json({ message: 'Réservé aux vendeurs' });
    }

    if (user.sellerVerification && user.sellerVerification.status === 'verified') {
      return res.status(400).json({ message: 'Vous êtes déjà vérifié' });
    }

    user.sellerVerification = {
      status:      'pending',
      idCardFront,
      idCardBack:  idCardBack || null,
      submittedAt: new Date(),
      reviewedAt:  null,
      rejectReason: null,
    };
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: 'Demande de vérification envoyée. Validation sous 48h.',
      status: 'pending',
    });
  } catch (error) { next(error); }
};

// ── GET /api/verification/status ──────────────────────────────────────────────
exports.getStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('sellerVerification proSubscription');
    const pro = user.proSubscription || {};
    const isPro = pro.active && (!pro.expiresAt || new Date(pro.expiresAt) > new Date());

    res.json({
      success: true,
      verification: {
        status: user.sellerVerification ? user.sellerVerification.status : 'none',
        rejectReason: user.sellerVerification ? user.sellerVerification.rejectReason : null,
      },
      pro: {
        active: !!isPro,
        plan: pro.plan || 'none',
        expiresAt: pro.expiresAt || null,
      },
      proPricing: { monthly: PRO_PRICE_MONTHLY, yearly: PRO_PRICE_YEARLY },
    });
  } catch (error) { next(error); }
};

// ── GET /api/verification/pending ─────────────────────────────────────────────
// Admin : liste des demandes de vérification en attente
exports.getPending = async (req, res, next) => {
  try {
    const users = await User.find({ 'sellerVerification.status': 'pending' })
      .select('name email shopName sellerVerification createdAt')
      .sort({ 'sellerVerification.submittedAt': 1 })
      .lean();

    res.json({ success: true, count: users.length, requests: users });
  } catch (error) { next(error); }
};

// ── PATCH /api/verification/:userId/review ────────────────────────────────────
// Admin : approuver ou rejeter une vérification
exports.reviewVerification = async (req, res, next) => {
  try {
    const { decision, reason } = req.body; // decision: 'approve' | 'reject'
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    if (!user.sellerVerification || user.sellerVerification.status !== 'pending') {
      return res.status(400).json({ message: 'Aucune demande en attente pour cet utilisateur' });
    }

    if (decision === 'approve') {
      user.sellerVerification.status = 'verified';
      user.sellerVerification.reviewedAt = new Date();
      user.sellerVerification.rejectReason = null;
    } else if (decision === 'reject') {
      user.sellerVerification.status = 'rejected';
      user.sellerVerification.reviewedAt = new Date();
      user.sellerVerification.rejectReason = reason || 'Document non conforme';
    } else {
      return res.status(400).json({ message: 'Décision invalide' });
    }

    await user.save({ validateBeforeSave: false });

    // Notification push si configurée
    try {
      const pushService = require('../services/pushService');
      pushService.sendToUser(user._id, {
        title: decision === 'approve' ? '✅ Compte vérifié !' : '❌ Vérification refusée',
        body: decision === 'approve'
          ? 'Votre badge vendeur vérifié est actif'
          : (reason || 'Document non conforme, réessayez'),
        url: '/?page=dashboard',
      }, 'sale').catch(() => {});
    } catch(e) {}

    res.json({ success: true, status: user.sellerVerification.status });
  } catch (error) { next(error); }
};

// ── POST /api/verification/pro/subscribe ──────────────────────────────────────
// Souscrire à l'abonnement Pro (paiement validé manuellement par admin pour MVP)
exports.subscribePro = async (req, res, next) => {
  try {
    const { plan } = req.body; // 'monthly' | 'yearly'
    if (!['monthly', 'yearly'].includes(plan)) {
      return res.status(400).json({ message: 'Plan invalide' });
    }

    const user = await User.findById(req.user._id);
    if (user.role !== 'vendor' && user.role !== 'admin') {
      return res.status(403).json({ message: 'Réservé aux vendeurs' });
    }

    const now = new Date();
    const expiresAt = new Date(now);
    if (plan === 'monthly') expiresAt.setMonth(now.getMonth() + 1);
    else expiresAt.setFullYear(now.getFullYear() + 1);

    // Pour le MVP : activation immédiate (paiement à brancher avec CMI plus tard)
    user.proSubscription = {
      active: true,
      plan,
      startedAt: now,
      expiresAt,
    };
    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: `Abonnement Pro ${plan === 'monthly' ? 'mensuel' : 'annuel'} activé !`,
      pro: { active: true, plan, expiresAt },
    });
  } catch (error) { next(error); }
};
