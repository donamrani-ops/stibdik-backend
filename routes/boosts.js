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

// ── Public (avant protect) ────────────────────────────────────────────────────
router.get('/plans', bc.getPlans);

// ── Toutes les routes suivantes nécessitent un token ─────────────────────────
router.use(protect);

// ── Routes spécifiques (DOIVENT être avant /:id pour éviter les conflits) ────
router.get('/my/stats', authorize('vendor', 'admin'), bc.getMyStats);
router.get('/my',       authorize('vendor', 'admin'), bc.getMyBoosts);
router.post('/request', authorize('vendor', 'admin'), bc.requestBoost);

// Admin — routes fixes avant les routes paramétrées /:id
router.get('/admin/all', authorize('admin'), bc.adminGetAll);

// ── Routes paramétrées /:id (en dernier pour éviter de capturer les routes fixes)
router.patch('/:id/activate', authorize('admin'), bc.adminActivate);
router.patch('/:id/cancel',   bc.cancelBoost);
router.patch('/:id/track',    trackLimiter, bc.trackEvent);

module.exports = router;
