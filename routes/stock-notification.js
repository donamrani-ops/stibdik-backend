const express = require('express');
const router  = express.Router();
const { subscribe, checkSubscription } = require('../controllers/stockNotificationController');
const { protect } = require('../middleware/auth');

router.post('/',                    protect, subscribe);
router.get('/check/:productId',     protect, checkSubscription);

module.exports = router;
