const express = require('express');
const router  = express.Router();
const tc      = require('../controllers/ticketController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// ── Routes admin (AVANT /:id pour éviter les conflits) ──────────────────────
router.get('/admin/stats',         authorize('admin'), tc.adminStats);
router.get('/admin',               authorize('admin'), tc.adminGetTickets);
router.get('/admin/:id',           authorize('admin'), tc.adminGetTicket);
router.post('/admin/:id/reply',    authorize('admin'), tc.adminReply);
router.patch('/admin/:id/status',  authorize('admin'), tc.adminUpdateStatus);

// ── Routes utilisateur ───────────────────────────────────────────────────────
router.post('/',           tc.createTicket);
router.get('/my',          tc.getMyTickets);
router.get('/:id',         tc.getTicket);
router.post('/:id/reply',  tc.replyTicket);
router.patch('/:id/close', tc.closeTicket);

module.exports = router;
