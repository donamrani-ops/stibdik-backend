// Routes: Coupons
const express = require('express');
const router  = express.Router();
const cc      = require('../controllers/couponController');
const { protect, authorize } = require('../middleware/auth');

// ── Public ────────────────────────────────────────────────────────────────────
// validate est public (pas de protect) — le controller lit req.user si dispo via middleware optionnel
router.get('/validate', cc.validateCoupon);

// ── Authentifié ───────────────────────────────────────────────────────────────
router.post('/apply', protect, cc.applyCoupon);

// ── Admin (routes fixes avant /:id) ──────────────────────────────────────────
router.get('/admin/all',       protect, authorize('admin'), cc.adminGetAll);
router.post('/admin',          protect, authorize('admin'), cc.adminCreate);
router.get('/admin/:id/stats', protect, authorize('admin'), cc.adminStats);
router.put('/admin/:id',       protect, authorize('admin'), cc.adminUpdate);
router.delete('/admin/:id',    protect, authorize('admin'), cc.adminDelete);

module.exports = router;
