// Routes: Upload (Cloudinary)
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// TODO: Implement Cloudinary upload
router.post('/image', protect, (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Upload endpoint - À implémenter avec Cloudinary'
  });
});

module.exports = router;
