// Routes: Products
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');

// ─── Routes publiques ────────────────────────────────────────
router.get('/', productController.getAllProducts);
router.get('/trending', productController.getTrending);
router.get('/:id/similar', productController.getSimilarProducts);
router.get('/:id', productController.getProduct);
router.patch('/:id/views', productController.incrementViews);

// ─── Routes protégées ────────────────────────────────────────

// Création : vendor ou admin uniquement
router.post('/', protect, authorize('vendor', 'admin'), productController.createProduct);

// Modification : vendor ou admin, avec restriction des champs (voir productController)
router.put('/:id', protect, authorize('vendor', 'admin'), productController.updateProduct);

// Suppression : vendor ou admin
router.delete('/:id', protect, authorize('vendor', 'admin'), productController.deleteProduct);

// Modification catégorie : admin uniquement
router.patch('/:id/category', protect, authorize('admin'), productController.updateProductCategory);

module.exports = router;
