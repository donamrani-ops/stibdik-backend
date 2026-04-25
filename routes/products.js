// Routes: Products
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');

// Public routes
router.get('/', productController.getAllProducts);
router.get('/trending', productController.getTrending);
router.get('/:id', productController.getProduct);
router.get('/:id/similar', productController.getSimilarProducts);

// Protected routes - Vendor/Admin
router.post('/', protect, authorize('vendor', 'admin'), productController.createProduct);
router.put('/:id', protect, productController.updateProduct);
router.delete('/:id', protect, productController.deleteProduct);
router.patch('/:id/views', productController.incrementViews);

module.exports = router;
