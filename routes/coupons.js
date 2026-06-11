// Routes: Coupons
const express = require('express');
const router  = express.Router();
const cc      = require('../controllers/couponController');
const { protect, authorize } = require('../middleware/auth');

// Routes fixes avant /:id
router.get('/validate',           protect,                   cc.validateCoupon);
router.post('/apply',             protect,                   cc.applyCoupon);
router.get('/my',                 protect,                   cc.getMyCoupons);

// Admin
router.get('/admin',              protect, authorize('admin'), cc.adminGetAll);
router.post('/admin',             protect, authorize('admin'), cc.adminCreate);
router.get('/admin/:id/usages',   protect, authorize('admin'), cc.adminGetUsages);
router.put('/admin/:id',          protect, authorize('admin'), cc.adminUpdate);
router.patch('/admin/:id/toggle', protect, authorize('admin'), cc.adminToggle);
router.delete('/admin/:id',       protect, authorize('admin'), cc.adminDelete);

module.exports = router;
