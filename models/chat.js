const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/chatController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/conversations',                     ctrl.getConversations);
router.post('/conversations',                    ctrl.getOrCreateConversation);
router.get('/conversations/:id/messages',        ctrl.getMessages);
router.post('/conversations/:id/messages',       ctrl.sendMessage);
router.patch('/conversations/:id/typing',        ctrl.setTyping);
router.get('/unread',                            ctrl.getUnreadCount);

module.exports = router;
