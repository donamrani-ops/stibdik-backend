// Routes: Payment (CMI Gateway)
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// TODO: Implement CMI payment gateway integration
router.post('/initiate', protect, (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Payment initiation - À implémenter avec CMI'
  });
});

router.post('/callback', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Payment callback - À implémenter'
  });
});

module.exports = router;
