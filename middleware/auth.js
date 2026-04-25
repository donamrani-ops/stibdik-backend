// ═══════════════════════════════════════════════════════════
//  MIDDLEWARE: AUTHENTICATION
//  Vérification JWT et gestion des rôles
// ═══════════════════════════════════════════════════════════

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protéger les routes - Vérifier le token JWT
exports.protect = async (req, res, next) => {
  let token;

  // Récupérer token depuis header Authorization
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Vérifier si token existe
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Non autorisé - Token manquant'
    });
  }

  try {
    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Récupérer l'utilisateur (sans le password)
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier si l'utilisateur est actif
    if (req.user.status === 'banned') {
      return res.status(403).json({
        success: false,
        message: 'Compte banni'
      });
    }

    if (req.user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Compte suspendu'
      });
    }

    next();
  } catch (error) {
    console.error('JWT Error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Token invalide ou expiré'
    });
  }
};

// Autoriser uniquement certains rôles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Rôle ${req.user.role} non autorisé pour cette action`
      });
    }
    next();
  };
};

// Vérifier si l'utilisateur est le propriétaire de la ressource
exports.checkOwnership = (model) => {
  return async (req, res, next) => {
    try {
      const resource = await model.findById(req.params.id);

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Ressource non trouvée'
        });
      }

      // Admin a accès à tout
      if (req.user.role === 'admin') {
        req.resource = resource;
        return next();
      }

      // Vérifier ownership (vendor/buyer)
      const ownerId = resource.vendor || resource.buyer || resource.user;

      if (ownerId && ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Accès refusé - Vous n\'êtes pas le propriétaire'
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Générer JWT Token
exports.generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Générer Refresh Token
exports.generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d'
  });
};
