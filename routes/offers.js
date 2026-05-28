const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/offerController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect); // toutes les routes nécessitent auth

router.post('/',                    ctrl.createOffer);
router.get('/my',                   ctrl.getMyOffers);
router.get('/received',             authorize('vendor','admin'), ctrl.getReceivedOffers);
router.get('/stats',                authorize('vendor','admin'), ctrl.getOfferStats);
router.patch('/:id/respond',        authorize('vendor','admin'), ctrl.respondToOffer);
router.patch('/:id/accept-counter', ctrl.acceptCounter);
router.patch('/:id/withdraw',       ctrl.withdrawOffer);

module.exports = router;
