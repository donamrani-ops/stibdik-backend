// routes/auth.js
const express        = require('express');
const router         = express.Router();
const authController = require('../controllers/authController');
const { protect }    = require('../middleware/auth');

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/register',         authController.register);
router.post('/login',            authController.login);
router.post('/google',           authController.googleLogin);
router.post('/facebook',         authController.facebookLogin);
router.post('/forgot-password',  authController.forgotPassword);
router.post('/reset-password',   authController.resetPassword);

// ── Privé (token requis) ──────────────────────────────────────────────────────
router.post('/logout',           protect, authController.logout);
router.get('/me',                protect, authController.getMe);

module.exports = router;
