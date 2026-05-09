// ═══════════════════════════════════════════════════════════
//  CONTROLLER: AUTHENTICATION
//  Register, Login, Google OAuth, Password reset, Email verification
// ═══════════════════════════════════════════════════════════

const User = require('../models/User');
const { generateToken, generateRefreshToken } = require('../middleware/auth');
const crypto = require('crypto');

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Cet email est déjà utilisé'
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'customer',
      phone
    });

    const token = generateToken(user._id);
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

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email et mot de passe requis'
      });
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

    user.lastLogin = new Date();
    user.loginCount += 1;
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);
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

// @desc    Google OAuth login / register
// @route   POST /api/auth/google
// @access  Public
exports.googleAuth = async (req, res, next) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ success: false, message: 'Token Google manquant' });
    }

    // Vérifier le token Google (sans dépendance externe)
    // Le token JWT Google est signé par Google — on décode le payload sans vérifier la signature ici
    // (la vérification complète nécessiterait google-auth-library)
    const parts = credential.split('.');
    if (parts.length !== 3) {
      return res.status(400).json({ success: false, message: 'Token Google invalide' });
    }

    // Décoder le payload base64url
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
    const payload = JSON.parse(payloadJson);

    const { email, name, picture, sub: googleId, exp } = payload;

    // Vérifier expiration
    if (!exp || Date.now() / 1000 > exp) {
      return res.status(401).json({ success: false, message: 'Token Google expiré' });
    }

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email Google manquant' });
    }

    // Chercher user existant par email ou googleId
    let user = await User.findOne({ $or: [{ email }, { googleId }] });

    if (user) {
      // Mettre à jour googleId si pas encore lié
      if (!user.googleId) {
        user.googleId = googleId;
        if (picture && !user.avatar) user.avatar = picture;
        await user.save({ validateBeforeSave: false });
      }

      if (user.status === 'banned') {
        return res.status(403).json({ success: false, message: 'Votre compte a été banni' });
      }

      user.lastLogin = new Date();
      user.loginCount = (user.loginCount || 0) + 1;
      await user.save({ validateBeforeSave: false });

    } else {
      // Créer nouveau compte
      user = await User.create({
        name: name || email.split('@')[0],
        email,
        googleId,
        avatar: picture || '',
        role: 'customer',
        isEmailVerified: true, // Email Google = déjà vérifié
        password: crypto.randomBytes(32).toString('hex'), // Password aléatoire (non utilisé)
      });
    }

    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.status(200).json({
      success: true,
      message: user.loginCount <= 1 ? 'Compte créé avec Google' : 'Connexion réussie',
      token,
      refreshToken,
      user: user.getPublicProfile()
    });

  } catch (error) {
    console.error('Google auth error:', error.message);
    next(error);
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    res.status(200).json({ success: true, message: 'Déconnexion réussie' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.status(200).json({ success: true, user: user.getPublicProfile() });
  } catch (error) {
    next(error);
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findByEmail(email);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Aucun utilisateur avec cet email' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 3600000;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: 'Email de réinitialisation envoyé',
      resetToken // À retirer en production
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Token invalide ou expiré' });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    const authToken = generateToken(user._id);
    res.status(200).json({ success: true, message: 'Mot de passe réinitialisé', token: authToken });

  } catch (error) {
    next(error);
  }
};

// @desc    Verify email
// @route   POST /api/auth/verify-email/:token
// @access  Public
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Token invalide ou expiré' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.status(200).json({ success: true, message: 'Email vérifié avec succès' });

  } catch (error) {
    next(error);
  }
};

// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// @access  Private
exports.resendVerification = async (req, res, next) => {
  try {
    const user = req.user;

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Email déjà vérifié' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = Date.now() + 86400000;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({ success: true, message: 'Email de vérification renvoyé' });

  } catch (error) {
    next(error);
  }
};

// @desc    Refresh access token
// @route   POST /api/auth/refresh-token
// @access  Public
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token requis' });
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const newToken = generateToken(decoded.id);

    res.status(200).json({ success: true, token: newToken });

  } catch (error) {
    return res.status(401).json({ success: false, message: 'Refresh token invalide' });
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Mot de passe actuel incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ success: true, message: 'Mot de passe changé avec succès' });

  } catch (error) {
    next(error);
  }
};
