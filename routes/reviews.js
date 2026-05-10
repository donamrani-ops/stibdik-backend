// Routes: Reviews
const express = require('express');
const router = express.Router();
const { getReviews, canReview, createReview, deleteReview } = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');

// Public
router.get('/', getReviews);

// Private
router.get('/can-review/:productId', protect, canReview);
router.post('/', protect, createReview);
router.delete('/:id', protect, deleteReview);

module.exports = router;
