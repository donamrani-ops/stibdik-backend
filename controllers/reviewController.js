// Controller: Reviews (Avis après achat vérifié)
const Review  = require('../models/Review');
const Order   = require('../models/Order');
const Product = require('../models/Product');
const crypto  = require('crypto');

// ─── Liste noire insultes (FR + AR + darija basique) ─────────────────────────
const BANNED_WORDS = [
  // Français
  'connard','connasse','merde','putain','salope','enculé','fdp','pd','nique',
  'bâtard','batard','cul','foutre','bordel','pute','con','chier','couille',
  // Arabe transcrit
  'kess','nik','zebi','tboun','kahba','sharmouta','manyak','weld lhram',
  'khara','hmar','kelb','wlad lqahba',
  // Darija
  'zomel','3erse','ma2foul'
];

const containsBannedWords = (text) => {
  const lower = text.toLowerCase().replace(/[^a-zàâäéèêëîïôùûüœ0-9\u0600-\u06FF ]/g, ' ');
  return BANNED_WORDS.some(w => lower.includes(w.toLowerCase()));
};

// Hash MD5 du commentaire nettoyé (pour détecter les doublons)
const hashComment = (text) => {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return crypto.createHash('md5').update(normalized).digest('hex');
};

// ─── Validation anti-spam ─────────────────────────────────────────────────────
const validateComment = (comment) => {
  if (!comment || typeof comment !== 'string') return 'Commentaire manquant';
  const trimmed = comment.trim();
  if (trimmed.length < 10) return 'Le commentaire doit faire au moins 10 caractères';
  if (trimmed.length > 1000) return 'Le commentaire ne peut pas dépasser 1000 caractères';
  if (containsBannedWords(trimmed)) return 'Le commentaire contient des termes inappropriés';
  // Détecter les répétitions massives (ex: "aaaaaa", "hahahahaha...")
  if (/(.)\1{9,}/.test(trimmed)) return 'Commentaire invalide (caractères répétés)';
  // Détecter les suites de mots identiques (spam)
  const words = trimmed.split(/\s+/);
  if (words.length > 3) {
    const unique = new Set(words.map(w => w.toLowerCase()));
    if (unique.size / words.length < 0.3) return 'Commentaire invalide (mots répétés)';
  }
  return null;
};

// ─── POST /api/reviews ─────────────────────────────────────────────────────────
// @desc    Créer un avis (achat vérifié obligatoire)
// @access  Authenticated (customer uniquement)
exports.createReview = async (req, res, next) => {
  try {
    const { orderId, rating, subRatings = {}, comment, photos = [] } = req.body;
    const reviewerId = req.user._id;

    // ── 1. Vérifier que la commande existe et appartient à l'acheteur ──────────
    const order = await Order.findById(orderId)
      .populate('product', 'nameFr nameAr images vendor')
      .populate('vendor', '_id');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Commande introuvable' });
    }
    if (order.buyer.toString() !== reviewerId.toString()) {
      return res.status(403).json({ success: false, message: 'Cette commande ne vous appartient pas' });
    }

    // ── 2. Statut : delivered uniquement ──────────────────────────────────────
    if (!['delivered', 'completed'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Impossible de laisser un avis : la commande doit être livrée (statut actuel : ${order.status})`
      });
    }

    // ── 3. Une seule review par commande ──────────────────────────────────────
    const existing = await Review.findOne({ order: orderId });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Vous avez déjà laissé un avis pour cette commande' });
    }

    // ── 4. Empêcher le vendeur de se reviewer lui-même ────────────────────────
    if (order.vendor._id.toString() === reviewerId.toString()) {
      return res.status(403).json({ success: false, message: 'Vous ne pouvez pas laisser un avis sur vos propres produits' });
    }

    // ── 5. Validation note ────────────────────────────────────────────────────
    const ratingNum = Number(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, message: 'La note doit être entre 1 et 5' });
    }

    // ── 6. Validation commentaire ─────────────────────────────────────────────
    const commentError = validateComment(comment);
    if (commentError) {
      return res.status(400).json({ success: false, message: commentError });
    }

    // ── 7. Détecter les reviews identiques (même hash = même contenu) ─────────
    const hash = hashComment(comment);
    const duplicateContent = await Review.findOne({
      contentHash: hash,
      reviewer: reviewerId
    });
    if (duplicateContent) {
      return res.status(409).json({ success: false, message: 'Vous avez déjà soumis un avis identique sur un autre produit' });
    }

    // ── 8. Valider les sous-notes (optionnelles mais bornées) ─────────────────
    const validatedSub = {};
    ['communication', 'conformity', 'delivery', 'packaging'].forEach(k => {
      if (subRatings[k] != null) {
        const v = Number(subRatings[k]);
        if (v >= 1 && v <= 5) validatedSub[k] = v;
      }
    });

    // ── 9. Valider les photos (max 5, format {url, publicId}) ─────────────────
    const validatedPhotos = (photos || []).slice(0, 5).filter(p => p.url && p.publicId);

    // ── 10. Snapshot produit ──────────────────────────────────────────────────
    const productDoc = order.product;
    const snapshot = {
      nameFr: productDoc.nameFr,
      nameAr: productDoc.nameAr,
      image:  productDoc.images?.[0]?.url || null
    };

    // ── 11. Créer la review ────────────────────────────────────────────────────
    const review = await Review.create({
      order:           orderId,
      product:         productDoc._id,
      vendor:          order.vendor._id,
      reviewer:        reviewerId,
      rating:          ratingNum,
      subRatings:      validatedSub,
      comment:         comment.trim(),
      contentHash:     hash,
      photos:          validatedPhotos,
      verifiedPurchase: true,
      productSnapshot: snapshot
    });

    // ── 12. Marquer la commande comme reviewée ────────────────────────────────
    await Order.findByIdAndUpdate(orderId, { reviewId: review._id });

    // ── 13. Mettre à jour les stats du produit et du vendeur ──────────────────
    const [productStats, vendorStats] = await Promise.all([
      Review.getProductStats(productDoc._id),
      Review.getVendorStats(order.vendor._id)
    ]);

    await Promise.all([
      Product.findByIdAndUpdate(productDoc._id, {
        'stats.avgRating':   productStats.avgRating,
        'stats.reviewCount': productStats.count
      }).catch(() => {}),
      require('../models/User').findByIdAndUpdate(order.vendor._id, {
        'stats.averageRating': vendorStats.avgRating,
        'stats.reviewCount':   vendorStats.count
      }).catch(() => {})
    ]);

    const populated = await Review.findById(review._id)
      .populate('reviewer', 'name avatar');

    res.status(201).json({ success: true, review: populated });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Un avis existe déjà pour cette commande' });
    }
    next(error);
  }
};

// ─── GET /api/reviews/product/:productId ─────────────────────────────────────
// @desc    Récupérer les avis d'un produit (+ stats)
// @access  Public
exports.getProductReviews = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sort = 'recent' } = req.query;

    const sortMap = {
      recent:   { createdAt: -1 },
      helpful:  { 'likes.length': -1, createdAt: -1 },
      highest:  { rating: -1, createdAt: -1 },
      lowest:   { rating: 1, createdAt: -1 }
    };

    const [reviews, stats] = await Promise.all([
      Review.find({ product: productId, isHidden: false })
        .populate('reviewer', 'name avatar')
        .sort(sortMap[sort] || sortMap.recent)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean(),
      Review.getProductStats(productId)
    ]);

    // Ajouter le compteur de likes sans exposer les IDs
    const mapped = reviews.map(r => ({
      ...r,
      likeCount: r.likes?.length || 0,
      reportCount: r.reports?.length || 0,
      likes: undefined,
      reports: undefined
    }));

    const total = await Review.countDocuments({ product: productId, isHidden: false });

    res.json({
      success: true,
      stats,
      count: reviews.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      reviews: mapped
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/reviews/vendor/:vendorId ────────────────────────────────────────
// @desc    Récupérer les avis d'un vendeur (+ stats)
// @access  Public
exports.getVendorReviews = async (req, res, next) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 10, sort = 'recent' } = req.query;

    const sortMap = {
      recent:  { createdAt: -1 },
      helpful: { createdAt: -1 },
      highest: { rating: -1, createdAt: -1 },
      lowest:  { rating: 1, createdAt: -1 }
    };

    const [reviews, stats] = await Promise.all([
      Review.find({ vendor: vendorId, isHidden: false })
        .populate('reviewer', 'name avatar')
        .populate('product',  'nameFr nameAr images')
        .sort(sortMap[sort] || sortMap.recent)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean(),
      Review.getVendorStats(vendorId)
    ]);

    const mapped = reviews.map(r => ({
      ...r,
      vendorId: vendorId, // Ajouter explicitement pour comparaison frontend
      likeCount: r.likes?.length || 0,
      likes: undefined,
      reports: undefined
    }));

    const total = await Review.countDocuments({ vendor: vendorId, isHidden: false });

    res.json({
      success: true,
      stats,
      count: reviews.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      reviews: mapped
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/reviews/can-review/:orderId ────────────────────────────────────
// @desc    Vérifier si l'utilisateur peut laisser un avis pour cette commande
// @access  Authenticated
exports.canReview = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const reviewerId = req.user._id;

    const order = await Order.findById(orderId).populate('vendor', '_id');
    if (!order) return res.json({ canReview: false, reason: 'Commande introuvable' });
    if (order.buyer.toString() !== reviewerId.toString()) return res.json({ canReview: false, reason: 'Pas votre commande' });
    if (!['delivered', 'completed'].includes(order.status)) return res.json({ canReview: false, reason: `Commande non livrée (${order.status})` });
    if (order.vendor._id.toString() === reviewerId.toString()) return res.json({ canReview: false, reason: 'Auto-review interdit' });

    const existing = await Review.findOne({ order: orderId });
    if (existing) return res.json({ canReview: false, reason: 'Déjà reviewé', reviewId: existing._id });

    res.json({ canReview: true });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/reviews/:id/like ───────────────────────────────────────────────
// @desc    Toggle "Avis utile"
// @access  Authenticated
exports.toggleLike = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Avis introuvable' });

    const userId = req.user._id.toString();
    const idx = review.likes.findIndex(l => l.user.toString() === userId);

    if (idx >= 0) {
      review.likes.splice(idx, 1);
    } else {
      review.likes.push({ user: req.user._id });
    }

    await review.save();
    res.json({ success: true, likeCount: review.likes.length, liked: idx < 0 });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/reviews/:id/reply ─────────────────────────────────────────────
// @desc    Réponse du vendeur à un avis
// @access  Authenticated (vendor propriétaire uniquement)
exports.vendorReply = async (req, res, next) => {
  try {
    const { text } = req.body;
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Avis introuvable' });

    if (review.vendor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Seul le vendeur concerné peut répondre' });
    }

    const commentError = validateComment(text);
    if (commentError) return res.status(400).json({ success: false, message: commentError });

    if (review.vendorReply) {
      review.vendorReply.text = text.trim();
      review.vendorReply.updatedAt = new Date();
    } else {
      review.vendorReply = { text: text.trim() };
    }

    await review.save();
    res.json({ success: true, vendorReply: review.vendorReply });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/reviews/:id/report ────────────────────────────────────────────
// @desc    Signaler un avis abusif
// @access  Authenticated
exports.reportReview = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const validReasons = ['spam', 'inappropriate', 'fake', 'offensive', 'other'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ success: false, message: 'Raison invalide' });
    }

    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Avis introuvable' });

    const userId = req.user._id.toString();
    const alreadyReported = review.reports.some(r => r.user.toString() === userId);
    if (alreadyReported) {
      return res.status(409).json({ success: false, message: 'Vous avez déjà signalé cet avis' });
    }

    review.reports.push({ user: req.user._id, reason });

    // Masquage automatique si ≥ 5 signalements
    if (review.reports.length >= 5) {
      review.isHidden = true;
      review.moderationNote = 'Masqué automatiquement (5 signalements)';
    }

    await review.save();
    res.json({ success: true, message: 'Avis signalé. Merci pour votre contribution.' });
  } catch (error) {
    next(error);
  }
};

// ─── DELETE /api/reviews/:id ─────────────────────────────────────────────────
// @desc    Supprimer un avis (auteur ou admin)
// @access  Authenticated
exports.deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Avis introuvable' });

    const isAdmin = req.user.role === 'admin';
    const isAuthor = review.reviewer.toString() === req.user._id.toString();
    if (!isAdmin && !isAuthor) {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }

    await review.deleteOne();

    // Recalculer les stats
    await Promise.all([
      Review.getProductStats(review.product).then(stats =>
        Product.findByIdAndUpdate(review.product, {
          'stats.avgRating': stats.avgRating,
          'stats.reviewCount': stats.count
        }).catch(() => {})
      ),
      Review.getVendorStats(review.vendor).then(stats =>
        require('../models/User').findByIdAndUpdate(review.vendor, {
          'stats.averageRating': stats.avgRating,
          'stats.reviewCount': stats.count
        }).catch(() => {})
      )
    ]);

    res.json({ success: true, message: 'Avis supprimé' });
  } catch (error) {
    next(error);
  }
};

// ─── PATCH /api/reviews/:id/hide  (admin) ────────────────────────────────────
exports.hideReview = async (req, res, next) => {
  try {
    const { hide = true, note = '' } = req.body;
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { isHidden: hide, moderationNote: note },
      { new: true }
    );
    if (!review) return res.status(404).json({ success: false, message: 'Avis introuvable' });
    res.json({ success: true, review });
  } catch (error) {
    next(error);
  }
};
