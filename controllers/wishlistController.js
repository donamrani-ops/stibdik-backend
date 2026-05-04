// Controller: Wishlist (favoris)
const User = require('../models/User');
const Product = require('../models/Product');
const mongoose = require('mongoose');

// @desc    Récupérer la wishlist du user connecté (avec produits populés)
// @route   GET /api/wishlist
// @access  Authenticated
exports.getWishlist = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'wishlist',
        select: 'nameFr nameAr price original images type city rating reviews status badge views',
        populate: {
          path: 'category',
          select: 'name nameAr icon'
        }
      });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    // Filtrer les produits qui auraient été supprimés (références orphelines)
    const validProducts = (user.wishlist || []).filter(p => p);

    res.status(200).json({
      success: true,
      count: validProducts.length,
      products: validProducts
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Récupérer juste les IDs (utile pour vérifier rapidement si X est dans la wishlist)
// @route   GET /api/wishlist/ids
// @access  Authenticated
exports.getWishlistIds = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('wishlist');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }
    res.status(200).json({
      success: true,
      ids: (user.wishlist || []).map(id => id.toString())
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Ajouter un produit à la wishlist
// @route   POST /api/wishlist/:productId
// @access  Authenticated
exports.addToWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'ID produit invalide' });
    }

    // Vérifier que le produit existe (sinon on stocke des références mortes)
    const product = await Product.findById(productId).select('_id');
    if (!product) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    // $addToSet évite les doublons (atomique, plus sûr qu'un find/check/save)
    const result = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { wishlist: productId } },
      { new: true, select: 'wishlist' }
    );

    if (!result) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    // Incrémenter le compteur favorites du produit (utile pour les stats)
    // On le fait en background, pas de await — pas critique si ça échoue
    Product.findByIdAndUpdate(productId, { $inc: { favorites: 1 } }).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Ajouté à la wishlist',
      count: result.wishlist.length
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Retirer un produit de la wishlist
// @route   DELETE /api/wishlist/:productId
// @access  Authenticated
exports.removeFromWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'ID produit invalide' });
    }

    const result = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { wishlist: productId } },
      { new: true, select: 'wishlist' }
    );

    if (!result) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    // Décrémenter favorites (sans descendre sous 0)
    Product.findByIdAndUpdate(
      productId,
      [{ $set: { favorites: { $max: [{ $subtract: ['$favorites', 1] }, 0] } } }]
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: 'Retiré de la wishlist',
      count: result.wishlist.length
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Sync : remplacer entièrement la wishlist (utile à la connexion pour
//          fusionner localStorage côté client avec ce qui est en DB)
// @route   POST /api/wishlist/sync
// @access  Authenticated
// @body    { productIds: ["...", "..."] }  — liste à fusionner avec l'existant
exports.syncWishlist = async (req, res, next) => {
  try {
    const { productIds = [] } = req.body;

    if (!Array.isArray(productIds)) {
      return res.status(400).json({
        success: false,
        message: 'productIds doit être un tableau'
      });
    }

    // Filtrer les IDs valides
    const validIds = productIds.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
      // Rien à sync, on retourne juste l'existant
      return exports.getWishlistIds(req, res, next);
    }

    // Vérifier que les produits existent (évite refs mortes)
    const existingProducts = await Product.find({
      _id: { $in: validIds }
    }).select('_id');
    const existingIds = existingProducts.map(p => p._id.toString());

    // $addToSet avec $each : ajoute uniquement ceux qui n'y sont pas déjà
    const result = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { wishlist: { $each: existingIds } } },
      { new: true, select: 'wishlist' }
    );

    res.status(200).json({
      success: true,
      ids: (result.wishlist || []).map(id => id.toString()),
      added: existingIds.length,
      skipped: productIds.length - existingIds.length
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Vider entièrement la wishlist
// @route   DELETE /api/wishlist
// @access  Authenticated
exports.clearWishlist = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { wishlist: [] });
    res.status(200).json({ success: true, message: 'Wishlist vidée' });
  } catch (error) {
    next(error);
  }
};
