// routes/analytics.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/analyticsController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('admin'));

router.get('/overview',   ctrl.getOverview);
router.get('/timeseries', ctrl.getTimeseries);
router.get('/top',        ctrl.getTop);

module.exports = router;
