const crypto = require('crypto');
const User   = require('../models/User');
const { generateToken, generateRefreshToken } = require('../middleware/auth');
const emailService = require('../services/emailService');

// ── POST /api/auth/register ───────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, phone, shopName } = req.body;

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Cet email est déjà utilisé' });
    }

    const user = await User.create({ name, email, password, role: role || 'customer', phone, shopName });

    const token        = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Inscription réussie',
      token,
      refreshToken,
      user: user.getPublicProfile()
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Identifiants incorrects' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Identifiants incorrects' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ success: false, message: 'Votre compte a été banni' });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Votre compte est suspendu' });
    }

    user.lastLogin  = new Date();
    user.loginCount += 1;
    await user.save({ validateBeforeSave: false });

    const token        = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Connexion réussie',
      token,
      refreshToken,
      user: user.getPublicProfile()
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  res.status(200).json({ success: true, message: 'Déconnexion réussie' });
};

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.status(200).json({ success: true, user: user.getPublicProfile() });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/auth/google ─────────────────────────────────────────────────────
exports.googleLogin = async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'Credential manquant' });

    const { OAuth2Client } = require('google-auth-library');
    const client  = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket  = await client.verifyIdToken({
      idToken:  credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    let user = await User.findOne({ email: payload.email });
    if (!user) {
      user = await User.create({
        name:            payload.name || payload.email.split('@')[0],
        email:           payload.email,
        password:        crypto.randomBytes(20).toString('hex'),
        role:            'customer',
        isEmailVerified: true,
        avatar:          payload.picture || null
      });
    }

    const token        = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.status(200).json({ success: true, token, refreshToken, user: user.getPublicProfile() });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email requis' });

    const GENERIC_OK = { message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' };

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.json(GENERIC_OK);

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h

    user.resetPasswordToken   = token;
    user.resetPasswordExpires = expires;
    await user.save({ validateBeforeSave: false });

    const resetUrl = `https://stibdik.pages.dev/?reset=${token}`;
    await emailService.sendResetPassword(user, resetUrl);

    res.json(GENERIC_OK);
  } catch (err) {
    console.error('forgotPassword error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── POST /api/auth/reset-password ────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token et mot de passe requis' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Mot de passe trop court (minimum 6 caractères)' });
    }

    const user = await User.findOne({
      resetPasswordToken:   token,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Lien invalide ou expiré' });
    }

    user.password             = password;
    user.resetPasswordToken   = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (err) {
    console.error('resetPassword error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};
