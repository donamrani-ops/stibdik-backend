const User = require('../models/User');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');
const { generateToken } = require('../middleware/auth');

// Get current user profile
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.status(200).json({ success: true, user });
  } catch (error) { next(error); }
};

// Update profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, shopName, shopDescription, addresses } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { name, phone, shopName, shopDescription, addresses },
      { new: true, runValidators: true }
    ).select('-password');
    res.status(200).json({ success: true, message: 'Profil mis à jour', user });
  } catch (error) { next(error); }
};

// ── POST /api/users/become-vendor ─────────────────────────────────────────────
// Self-service : un customer devient vendor immédiatement (vérif ID optionnelle après)
exports.becomeVendor = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    // Déjà vendor ou admin : rien à faire
    if (user.role === 'vendor' || user.role === 'admin') {
      return res.status(200).json({
        success: true,
        message: 'Vous êtes déjà vendeur',
        alreadyVendor: true,
        token: generateToken(user._id),
        user: user.getPublicProfile()
      });
    }

    if (user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Action non autorisée pour ce compte' });
    }

    // Passage en vendor
    user.role = 'vendor';

    // Nom de boutique optionnel fourni à l'inscription vendeur, sinon fallback sur le nom
    const { shopName, shopDescription } = req.body || {};
    if (shopName && String(shopName).trim()) {
      user.shopName = String(shopName).trim().slice(0, 100);
    } else if (!user.shopName) {
      user.shopName = user.name;
    }
    if (shopDescription && String(shopDescription).trim()) {
      user.shopDescription = String(shopDescription).trim();
    }

    await user.save({ validateBeforeSave: false });

    try {
      await AuditLog.log(user, 'user.role_change',
        { type: 'user', id: user._id, name: user.name }, { newRole: 'vendor', selfUpgrade: true }, req);
    } catch (e) { /* log non bloquant */ }

    res.status(200).json({
      success: true,
      message: 'Félicitations ! Vous êtes maintenant vendeur.',
      token: generateToken(user._id),
      user: user.getPublicProfile()
    });
  } catch (error) { next(error); }
};

// Get all users (Admin)
exports.getAllUsers = async (req, res, next) => {
  try {
    const { role, status, page = 1, limit = 20, search } = req.query;
    const query = {};
    if (role)   query.role   = role;
    if (status) query.status = status;
    // Recherche backend par nom ou email
    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    const users = await User.find(query)
      .select('-password')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);
    const total = await User.countDocuments(query);
    res.status(200).json({ success: true, count: users.length, total, page: parseInt(page), pages: Math.ceil(total / limit), users });
  } catch (error) { next(error); }
};

// Get single user (Admin)
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    res.status(200).json({ success: true, user });
  } catch (error) { next(error); }
};

// Update user status (Admin)
exports.updateUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['active', 'suspended', 'deleted'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Statut invalide. Valeurs: ${validStatuses.join(', ')}` });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    await AuditLog.log(req.user, status==='suspended'?'user.suspend':'user.unsuspend',
      { type:'user', id:user._id, name:user.name+' ('+user.email+')' }, { oldStatus: status==='suspended'?'active':'suspended', newStatus: status }, req);
    res.status(200).json({ success: true, message: 'Statut mis à jour', user });
  } catch (error) { next(error); }
};

// Update user role (Admin)
exports.updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const validRoles = ['customer', 'vendor', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: `Rôle invalide. Valeurs: ${validRoles.join(', ')}` });
    }
    // Empêcher l'admin de se dégrader lui-même
    if (req.params.id === req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Impossible de modifier votre propre rôle' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    await AuditLog.log(req.user, 'user.role_change',
      { type:'user', id:user._id, name:user.name }, { newRole: role }, req);
    res.status(200).json({ success: true, message: `Rôle changé → ${role}`, user });
  } catch (error) { next(error); }
};

// Reset password (Admin) — génère un mot de passe temporaire
exports.adminResetPassword = async (req, res, next) => {
  try {
    const { newPassword, forceChange = true } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    // Empêcher l'admin de réinitialiser son propre MDP ici (il a son propre profil)
    if (req.params.id === req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Utilisez les paramètres de votre profil pour changer votre mot de passe' });
    }

    // Générer un mot de passe temporaire si non fourni
    const tempPassword = newPassword || crypto.randomBytes(6).toString('hex'); // ex: "a3f9b2c1"

    // Hasher
    const hashed = await bcrypt.hash(tempPassword, 12);
    user.password = hashed;
    // Marquer "forcer le changement au prochain login" si souhaité
    if (forceChange) user.mustChangePassword = true;
    await user.save({ validateBeforeSave: false });

    await AuditLog.log(req.user, 'user.reset_password',
      { type:'user', id:user._id, name:user.name }, { forceChange }, req);
    res.status(200).json({
      success: true,
      message: 'Mot de passe réinitialisé',
      // IMPORTANT : on retourne le MDP en clair UNE SEULE FOIS pour que l'admin puisse le communiquer
      // Il ne sera plus jamais accessible après ça
      tempPassword: newPassword ? '[fourni par l\'admin]' : tempPassword,
      forceChange
    });
  } catch (error) { next(error); }
};

// Delete user (Admin)
exports.deleteUser = async (req, res, next) => {
  try {
    // Double confirmation : l'ID doit être dans le body aussi (sécurité anti-CSRF)
    const { confirmId } = req.body;
    if (confirmId && confirmId !== req.params.id) {
      return res.status(400).json({ success: false, message: 'Confirmation invalide' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    if (req.params.id === req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Impossible de supprimer votre propre compte' });
    }
    const deletedInfo = { name: user.name, email: user.email };
    await user.deleteOne();
    await AuditLog.log(req.user, 'user.delete',
      { type:'user', id:req.params.id, name:deletedInfo.name+' ('+deletedInfo.email+')' }, {}, req);
    res.status(200).json({ success: true, message: 'Utilisateur supprimé' });
  } catch (error) { next(error); }
};

// Change own password (authenticated user)
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Mot de passe actuel et nouveau requis' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Le nouveau mot de passe doit faire au moins 6 caractères' });
    }

    // Récupérer le hash directement depuis MongoDB (contourne les problèmes de select)
    const mongoose = require('mongoose');
    const userDoc = await mongoose.connection.collection('users').findOne(
      { _id: new mongoose.Types.ObjectId(req.user._id || req.user.id) },
      { projection: { password: 1 } }
    );
    if (!userDoc) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    if (!userDoc.password) return res.status(500).json({ success: false, message: 'Erreur de configuration' });

    // Comparer directement avec bcrypt
    const isMatch = await bcrypt.compare(currentPassword, userDoc.password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Mot de passe actuel incorrect' });

    // Hasher et sauvegarder le nouveau mot de passe
    const hashed = await bcrypt.hash(newPassword, 12);
    await mongoose.connection.collection('users').updateOne(
      { _id: userDoc._id },
      { $set: { password: hashed, mustChangePassword: false } }
    );

    res.json({ success: true, message: 'Mot de passe changé avec succès' });
  } catch (error) { next(error); }
};
