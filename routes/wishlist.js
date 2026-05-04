// Routes: Wishlist (favoris)
const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlistController');
const { protect } = require('../middleware/auth');

// Toutes les routes nécessitent une authentification
router.use(protect);

// Lecture
router.get('/', wishlistController.getWishlist);
router.get('/ids', wishlistController.getWishlistIds);

// Écriture
router.post('/sync', wishlistController.syncWishlist);
router.post('/:productId', wishlistController.addToWishlist);
router.delete('/:productId', wishlistController.removeFromWishlist);
router.delete('/', wishlistController.clearWishlist);

module.exports = router;
