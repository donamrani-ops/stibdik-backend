// Routes: Products
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');

// ─── Routes publiques ────────────────────────────────────────────────────────
router.get('/',                   productController.getAllProducts);
router.get('/trending',           productController.getTrending);
router.get('/brands',             productController.getBrands);
router.get('/my',       protect,  productController.getMyProducts);

// ─── Routes avec :id (APRÈS les routes statiques) ────────────────────────────
router.get('/:id/similar',        productController.getSimilarProducts);
router.get('/:id',                productController.getProduct);
router.patch('/:id/views',        productController.incrementViews);

// ─── Routes protégées ────────────────────────────────────────────────────────
router.post('/',    protect, authorize('vendor', 'admin'), productController.createProduct);
router.put('/:id',  protect, authorize('vendor', 'admin'), productController.updateProduct);
router.delete('/:id', protect, authorize('vendor', 'admin'), productController.deleteProduct);

// Like / Unlike
router.post('/:id/like',   protect, productController.toggleLike);
router.delete('/:id/like', protect, productController.toggleLike);

// Admin only
router.patch('/:id/category', protect, authorize('admin'), productController.updateProductCategory);

module.exports = router;
