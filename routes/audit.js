// Routes: AuditLog
const express = require('express');
const router  = express.Router();
const ac      = require('../controllers/auditController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));
router.get('/',                      ac.getLogs);
router.get('/target/:type/:id',      ac.getTargetLogs);

module.exports = router;
