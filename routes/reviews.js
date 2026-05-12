// Routes: Reviews
const express = require('express');
const router  = express.Router();
const rc      = require('../controllers/reviewController');
const { protect, authorize } = require('../middleware/auth');

// Rate limiting spécifique aux reviews (plus strict que le global)
const rateLimit = require('express-rate-limit');
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5,                    // max 5 reviews par heure par IP
  message: { success: false, message: 'Trop de tentatives. Réessayez dans une heure.' },
  standardHeaders: true,
  legacyHeaders: false
});
const likeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // 30 likes/minute max
  message: { success: false, message: 'Trop de requêtes.' }
});

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/product/:productId', rc.getProductReviews);
router.get('/vendor/:vendorId',   rc.getVendorReviews);

// ── Authentifié ───────────────────────────────────────────────────────────────
router.use(protect);

router.get('/can-review/:orderId', rc.canReview);

router.post('/',                   reviewLimiter, rc.createReview);
router.post('/:id/like',           likeLimiter,   rc.toggleLike);
router.post('/:id/reply',          rc.vendorReply);
router.post('/:id/report',         rc.reportReview);
router.delete('/:id',              rc.deleteReview);

// ── Admin uniquement ──────────────────────────────────────────────────────────
router.patch('/:id/hide', authorize('admin'), rc.hideReview);

module.exports = router;
