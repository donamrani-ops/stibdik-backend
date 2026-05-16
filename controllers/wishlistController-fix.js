// Patch wishlistController.js - ajouter strictPopulate:false
// Remplacer dans les fonctions getWishlist et syncWishlist :

// AVANT :
// const user = await User.findById(req.user._id).populate('wishlist');

// APRÈS :
const User = require('../models/User');
const Product = require('../models/Product');

exports.getWishlist = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({ path: 'wishlist', strictPopulate: false, select: 'nameFr nameAr price images city status type vendor' });
    res.status(200).json({ success: true, products: user?.wishlist || [] });
  } catch (error) { next(error); }
};

exports.getWishlistIds = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('wishlist');
    res.status(200).json({ success: true, ids: user?.wishlist || [] });
  } catch (error) { next(error); }
};

exports.syncWishlist = async (req, res, next) => {
  try {
    const { productIds = [] } = req.body;
    if (!productIds.length) {
      const user = await User.findById(req.user._id)
        .populate({ path: 'wishlist', strictPopulate: false, select: 'nameFr nameAr price images city status type vendor' });
      return res.status(200).json({ success: true, products: user?.wishlist || [] });
    }
    // Fusionner avec la wishlist existante
    const user = await User.findById(req.user._id);
    const existingIds = (user.wishlist || []).map(String);
    const merged = [...new Set([...existingIds, ...productIds])];
    user.wishlist = merged;
    await user.save({ validateBeforeSave: false });
    const updated = await User.findById(req.user._id)
      .populate({ path: 'wishlist', strictPopulate: false, select: 'nameFr nameAr price images city status type vendor' });
    res.status(200).json({ success: true, products: updated?.wishlist || [] });
  } catch (error) { next(error); }
};

exports.addToWishlist = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { wishlist: req.params.productId } });
    res.status(200).json({ success: true, message: 'Ajouté aux favoris' });
  } catch (error) { next(error); }
};

exports.removeFromWishlist = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $pull: { wishlist: req.params.productId } });
    res.status(200).json({ success: true, message: 'Retiré des favoris' });
  } catch (error) { next(error); }
};

exports.clearWishlist = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $set: { wishlist: [] } });
    res.status(200).json({ success: true, message: 'Favoris vidés' });
  } catch (error) { next(error); }
};
