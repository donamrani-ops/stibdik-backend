// routes/referral.js
const express            = require('express');
const router             = express.Router();
const referralController = require('../controllers/referralController');
const { protect }        = require('../middleware/auth');

// Public — vérifier un code avant inscription
router.get('/validate/:code', referralController.validateCode);

// Privé — token requis
router.get('/me',             protect, referralController.getMyReferral);
router.post('/apply',         protect, referralController.applyReferral);

module.exports = router;
