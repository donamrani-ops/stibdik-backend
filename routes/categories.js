// Routes: Categories
const express = require('express');
const router  = express.Router();
const cc      = require('../controllers/categoryController');
const { protect, authorize } = require('../middleware/auth');

// ── Routes fixes (AVANT /:slug et /:id) ─────────────────────────────────────
router.get('/tree',     cc.getCategoryTree);
router.get('/featured', cc.getFeatured);
router.get('/main',     cc.getMainCategories);

// ── Route principale ─────────────────────────────────────────────────────────
router.get('/', cc.getAllCategories);

// ── Routes paramétrées ───────────────────────────────────────────────────────
router.get('/:id/children', cc.getChildren);
router.get('/:slug',        cc.getCategoryBySlug);

// ── Admin ────────────────────────────────────────────────────────────────────
router.post('/',                  protect, authorize('admin'), cc.createCategory);
router.put('/:id',                protect, authorize('admin'), cc.updateCategory);
router.patch('/:id/order',        protect, authorize('admin'), cc.updateOrder);
router.patch('/:id/toggle',       protect, authorize('admin'), cc.toggleActive);
router.delete('/:id',             protect, authorize('admin'), cc.deleteCategory);

module.exports = router;
