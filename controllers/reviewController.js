// ═══════════════════════════════════════════════════════════
//  CONTROLLER: REVIEWS
// ═══════════════════════════════════════════════════════════

const Review = require('../models/Review');
const Order  = require('../models/Order');

// @desc  Récupérer les avis d'un produit
// @route GET /api/reviews?product=:id&page=1&limit=5
// @access Public
exports.getReviews = async (req, res, next) => {
  try {
    const { product, page = 1, limit = 5 } = req.query;

    if (!product) {
      return res.status(400).json({ success: false, message: 'product requis' });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [reviews, total] = await Promise.all([
      Review.find({ product, status: 'approved' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('user', 'name avatar'),
      Review.countDocuments({ product, status: 'approved' }),
    ]);

    res.status(200).json({
      success: true,
      reviews,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    next(error);
  }
};

// @desc  Vérifier si l'user peut laisser un avis
// @route GET /api/reviews/can-review/:productId
// @access Private
exports.canReview = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const userId = req.user._id;

    // Vérifier si avis existant
    const existing = await Review.findOne({ product: productId, user: userId });
    if (existing) {
      return res.status(200).json({ success: true, canReview: false, reason: 'already_reviewed' });
    }

    // Vérifier si achat vérifié (commande livrée contenant ce produit)
    let verifiedPurchase = false;
    try {
      const order = await Order.findOne({
        buyer: userId,
        status: 'delivered',
        'items.product': productId,
      });
      verifiedPurchase = !!order;
    } catch {
      // Si le modèle Order n'a pas cette structure, on laisse passer
    }

    res.status(200).json({ success: true, canReview: true, verifiedPurchase });
  } catch (error) {
    next(error);
  }
};

// @desc  Créer un avis
// @route POST /api/reviews
// @access Private
exports.createReview = async (req, res, next) => {
  try {
    const { product, rating, title, comment } = req.body;

    if (!product || !rating || !comment) {
      return res.status(400).json({ success: false, message: 'product, rating et comment requis' });
    }

    // Vérifier doublon
    const existing = await Review.findOne({ product, user: req.user._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Vous avez déjà laissé un avis pour ce produit' });
    }

    // Vérifier achat vérifié
    let verifiedPurchase = false;
    try {
      const order = await Order.findOne({
        buyer: req.user._id,
        status: 'delivered',
        'items.product': product,
      });
      verifiedPurchase = !!order;
    } catch {}

    const review = await Review.create({
      product,
      user: req.user._id,
      rating: Math.min(5, Math.max(1, parseInt(rating))),
      title: title?.trim() || '',
      comment: comment.trim(),
      verifiedPurchase,
    });

    await review.populate('user', 'name avatar');

    res.status(201).json({ success: true, review });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Vous avez déjà laissé un avis pour ce produit' });
    }
    next(error);
  }
};

// @desc  Supprimer un avis (admin ou auteur)
// @route DELETE /api/reviews/:id
// @access Private
exports.deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: 'Avis non trouvé' });
    }

    if (review.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }

    await review.deleteOne();

    res.status(200).json({ success: true, message: 'Avis supprimé' });
  } catch (error) {
    next(error);
  }
};
