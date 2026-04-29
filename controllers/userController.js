const User = require('../models/User');

// Get current user profile
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.status(200).json({ success: true, user });
  } catch (error) {
    next(error);
  }
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
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════
//  ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════

// Create user (Admin only)
exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password, phone, shopName, role, status } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Cet email est déjà utilisé' });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      phone,
      shopName,
      role: role || 'customer',
      status: status || 'active'
    });

    // Return user without password
    const userResponse = await User.findById(user._id).select('-password');

    res.status(201).json({
      success: true,
      message: 'Utilisateur créé avec succès',
      user: userResponse
    });
  } catch (error) {
    next(error);
  }
};

// Update user (Admin only)
exports.updateUser = async (req, res, next) => {
  try {
    const { name, email, phone, shopName, role, status } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (shopName !== undefined) user.shopName = shopName;
    if (role) user.role = role;
    if (status) user.status = status;

    await user.save();

    const updatedUser = await User.findById(user._id).select('-password');

    res.status(200).json({
      success: true,
      message: 'Utilisateur mis à jour',
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

// Get all users (Admin)
exports.getAllUsers = async (req, res, next) => {
  try {
    const { role, status, page = 1, limit = 100 } = req.query;
    const query = {};
    
    if (role) query.role = role;
    if (status) query.status = status;

    const users = await User.find(query)
      .select('-password')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      users
    });
  } catch (error) {
    next(error);
  }
};

// Get single user (Admin)
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

// Update user status (Admin)
exports.updateUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    res.status(200).json({ success: true, message: 'Statut mis à jour', user });
  } catch (error) {
    next(error);
  }
};

// Delete user (Admin)
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    await user.deleteOne();

    res.status(200).json({ success: true, message: 'Utilisateur supprimé' });
  } catch (error) {
    next(error);
  }
};
