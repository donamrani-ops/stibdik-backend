const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/configController');
const { protect, authorize } = require('../middleware/auth');

router.get('/',         protect, authorize('admin'), ctrl.getAllConfigs);
router.get('/:key',     ctrl.getConfig);   // public — lu par le frontend
router.put('/:key',     protect, authorize('admin'), ctrl.setConfig);

module.exports = router;
