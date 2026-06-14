// routes/push.js
const express        = require('express');
const router         = express.Router();
const pushController = require('../controllers/pushController');
const { protect }    = require('../middleware/auth');

router.get('/key',           pushController.getPublicKey);       // public
router.post('/subscribe',    protect, pushController.subscribe);
router.post('/unsubscribe',  protect, pushController.unsubscribe);
router.patch('/prefs',       protect, pushController.updatePrefs);
router.post('/test',         protect, pushController.sendTest);

module.exports = router;
