// Routes: Users
const express = require('express');
const router  = express.Router();
const uc      = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiting sur reset password (sécurité)
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { success: false, message: 'Trop de tentatives de réinitialisation. Réessayez dans 15 min.' }
});

router.use(protect);

// ── Profil courant ──────────────────────────────────────────
router.get('/profile', uc.getProfile);
router.put('/profile', uc.updateProfile);
router.post('/change-password', uc.changePassword);
router.post('/become-vendor', uc.becomeVendor);

// ── Admin ───────────────────────────────────────────────────
// Routes fixes avant /:id
router.get('/', authorize('admin'), uc.getAllUsers);

// Routes paramétrées
router.get('/:id',                 authorize('admin'), uc.getUser);
router.put('/:id/status',          authorize('admin'), uc.updateUserStatus);
router.patch('/:id/role',          authorize('admin'), uc.updateUserRole);
router.post('/:id/reset-password', authorize('admin'), resetLimiter, uc.adminResetPassword);
router.delete('/:id',              authorize('admin'), uc.deleteUser);

module.exports = router;
