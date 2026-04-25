// Routes: Users
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// User profile
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);

// Admin only
router.get('/', authorize('admin'), userController.getAllUsers);
router.get('/:id', authorize('admin'), userController.getUser);
router.put('/:id/status', authorize('admin'), userController.updateUserStatus);
router.delete('/:id', authorize('admin'), userController.deleteUser);

module.exports = router;
