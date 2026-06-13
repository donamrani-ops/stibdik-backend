// controllers/otpController.js
const Otp        = require('../models/Otp');
const User       = require('../models/User');
const smsService = require('../services/smsService');
const { generateToken, generateRefreshToken } = require('../middleware/auth');

// ── Validation numéro marocain ────────────────────────────────────────────────
function normalizePhone(raw) {
  if (!raw) return null;
  let phone = String(raw).replace(/[\s\-().]/g, '');

  // Formats acceptés : 06XXXXXXXX, 07XXXXXXXX, +2126XXXXXXXX, +2127XXXXXXXX, 2126..., 2127...
  if (/^0[67]\d{8}$/.test(phone)) {
    return '+212' + phone.substring(1); // 06... → +2126...
  }
  if (/^\+212[67]\d{8}$/.test(phone)) {
    return phone;
  }
  if (/^212[67]\d{8}$/.test(phone)) {
    return '+' + phone;
  }
  return null; // Invalide
}

// Générer un code 6 chiffres
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── POST /api/auth/otp/send ───────────────────────────────────────────────────
exports.sendOtp = async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) {
      return res.status(400).json({ message: 'Numéro marocain invalide (format 06/07XXXXXXXX)' });
    }

    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || null;
    const now = new Date();

    // ── Anti-spam : limiter les envois ──────────────────────────────────────
    // Max 3 envois par numéro toutes les 15 minutes
    const recentSends = await Otp.countDocuments({
      phone,
      createdAt: { $gte: new Date(now.getTime() - 15 * 60 * 1000) },
    });
    if (recentSends >= 3) {
      return res.status(429).json({ message: 'Trop de demandes. Réessayez dans 15 minutes.' });
    }

    // Supprimer les anciens OTP non vérifiés pour ce numéro
    await Otp.deleteMany({ phone, verified: false });

    // Générer et stocker le nouveau code (hashé)
    const code = generateCode();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 min

    await Otp.create({
      phone,
      codeHash: Otp.hashCode(code),
      expiresAt,
      sendCount: recentSends + 1,
      requestIp: ip,
    });

    // Envoyer le SMS
    const result = await smsService.sendOtp(phone, code);

    const response = {
      success: true,
      message: 'Code envoyé par SMS',
      phone,
      expiresIn: 300, // secondes
    };

    // En mode test, retourner le code pour faciliter le dev
    if (result.devCode && smsService.getProvider() === 'test') {
      response.devCode = result.devCode;
      response.testMode = true;
    }

    res.json(response);
  } catch (error) {
    console.error('sendOtp error:', error);
    next(error);
  }
};

// ── POST /api/auth/otp/verify ─────────────────────────────────────────────────
exports.verifyOtp = async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { code, name } = req.body;

    if (!phone) {
      return res.status(400).json({ message: 'Numéro invalide' });
    }
    if (!code || !/^\d{6}$/.test(String(code))) {
      return res.status(400).json({ message: 'Code à 6 chiffres requis' });
    }

    // Trouver l'OTP le plus récent non vérifié
    const otp = await Otp.findOne({ phone, verified: false }).sort({ createdAt: -1 });

    if (!otp) {
      return res.status(400).json({ message: 'Aucun code en attente. Demandez un nouveau code.' });
    }

    // Vérifier l'expiration
    if (otp.expiresAt < new Date()) {
      await otp.deleteOne();
      return res.status(400).json({ message: 'Code expiré. Demandez un nouveau code.' });
    }

    // Limiter les tentatives (max 5)
    if (otp.attempts >= 5) {
      await otp.deleteOne();
      return res.status(429).json({ message: 'Trop de tentatives. Demandez un nouveau code.' });
    }

    // Vérifier le code
    if (!otp.verifyCode(code)) {
      otp.attempts += 1;
      await otp.save();
      return res.status(400).json({
        message: 'Code incorrect',
        attemptsLeft: Math.max(0, 5 - otp.attempts),
      });
    }

    // ── Code valide ! ───────────────────────────────────────────────────────
    otp.verified = true;
    await otp.save();

    // Chercher ou créer l'utilisateur
    let user = await User.findOne({ phone });

    if (!user) {
      user = await User.create({
        name:            name || ('Utilisateur ' + phone.slice(-4)),
        phone,
        email:           `${phone.replace('+', '')}@phone.stibdik.ma`,
        password:        require('crypto').randomBytes(20).toString('hex'),
        role:            'customer',
        isPhoneVerified: true,
      });
    } else if (!user.isPhoneVerified) {
      user.isPhoneVerified = true;
      await user.save({ validateBeforeSave: false });
    }

    // Nettoyer les OTP de ce numéro
    await Otp.deleteMany({ phone });

    const token        = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.json({
      success: true,
      token,
      refreshToken,
      user: user.getPublicProfile(),
    });
  } catch (error) {
    console.error('verifyOtp error:', error);
    next(error);
  }
};
