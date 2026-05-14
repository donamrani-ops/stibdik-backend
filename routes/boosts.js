// Routes: Boosts
const express = require('express');
const router  = express.Router();
const bc      = require('../controllers/boostController');
const { protect, authorize } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: 'Trop de requêtes de tracking' }
});

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/plans', bc.getPlans);

// ── Authentifié ───────────────────────────────────────────────────────────────
router.use(protect);
router.patch('/:id/track', trackLimiter, bc.trackEvent);

// ── Vendor ────────────────────────────────────────────────────────────────────
router.post('/request', authorize('vendor', 'admin'), bc.requestBoost);
router.get('/my',       authorize('vendor', 'admin'), bc.getMyBoosts);
router.get('/my/stats', authorize('vendor', 'admin'), bc.getMyStats);
router.patch('/:id/cancel', bc.cancelBoost);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get('/admin/all',        authorize('admin'), bc.adminGetAll);
router.patch('/:id/activate',   authorize('admin'), bc.adminActivate);

module.exports = router;
