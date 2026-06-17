// routes/verification.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/verificationController');
const { protect, authorize } = require('../middleware/auth');

// Vendeur
router.post('/submit',        protect, ctrl.submitVerification);
router.get('/status',         protect, ctrl.getStatus);
router.post('/pro/subscribe', protect, ctrl.subscribePro);

// Admin
router.get('/pending',              protect, authorize('admin'), ctrl.getPending);
router.patch('/:userId/review',     protect, authorize('admin'), ctrl.reviewVerification);

module.exports = router;
