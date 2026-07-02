// Routes: Brands
const express = require('express');
const router  = express.Router();
const bc      = require('../controllers/brandController');
const { protect, authorize } = require('../middleware/auth');

// ── Public ───────────────────────────────────────────────────────────────────
router.get('/', bc.getBrands);

// ── Admin ────────────────────────────────────────────────────────────────────
router.get('/admin/all',  protect, authorize('admin'), bc.getAllBrands);
router.post('/',          protect, authorize('admin'), bc.createBrand);
router.put('/:id',        protect, authorize('admin'), bc.updateBrand);
router.delete('/:id',     protect, authorize('admin'), bc.deleteBrand);

module.exports = router;
