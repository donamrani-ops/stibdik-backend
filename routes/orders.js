// Routes: Orders
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// Customer routes
router.post('/', orderController.createOrder);
router.get('/my-orders', orderController.getMyOrders);

// Vendor routes
router.get('/vendor-orders', authorize('vendor', 'admin'), orderController.getVendorOrders);

// Order details & updates
router.get('/:id', orderController.getOrder);
router.patch('/:id/status', orderController.updateOrderStatus);
router.patch('/:id/cancel', orderController.cancelOrder);

// Admin only
router.get('/stats/global', authorize('admin'), orderController.getGlobalStats);

module.exports = router;
