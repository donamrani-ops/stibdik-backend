const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/stockNotificationController');
const { protect, authorize } = require('../middleware/auth');

// ── Routes admin (AVANT :productId) ─────────────────────────────────────────

router.get('/admin/all', protect, authorize('admin'), async (req, res, next) => {
  try {
    const StockNotification = require('../models/StockNotification');
    const subs = await StockNotification.find({ notified: false })
      .populate('product', 'nameFr nameAr stock').lean();
    res.json({ success: true, count: subs.length, subscriptions: subs });
  } catch (err) { next(err); }
});

router.post('/admin/trigger/:productId', protect, authorize('admin'), async (req, res, next) => {
  try {
    const Product           = require('../models/Product');
    const StockNotification = require('../models/StockNotification');
    const emailService      = require('../services/emailService');
    const mongoose          = require('mongoose');
    const pid = new mongoose.Types.ObjectId(req.params.productId);
    const product = await Product.findById(pid);
    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    const subs = await StockNotification.find({ product: pid, notified: false });
    if (!subs.length) return res.json({ success: true, message: 'Aucun abonné', sent: 0 });
    let sent = 0;
    for (const sub of subs) {
      try {
        await emailService.sendRestockNotification(sub.email, sub.userName, product.nameFr || product.nameAr, pid);
        sub.notified = true; sub.notifiedAt = new Date(); await sub.save(); sent++;
      } catch (e) { console.warn('Email failed:', e.message); }
    }
    res.json({ success: true, sent, total: subs.length });
  } catch (err) { next(err); }
});

router.post('/restock-check', protect, async (req, res, next) => {
  try {
    const { productIds } = req.body;
    if (!Array.isArray(productIds) || productIds.length === 0)
      return res.json({ success: true, restocked: [], all: [] });

    const Product = require('../models/Product');

    // Récupérer TOUS les produits surveillés (pour comparaison de prix)
    const all = await Product.find({
      _id:    { $in: productIds },
      status: 'active'
    }).select('_id nameFr nameAr stock price images').lean();

    // Filtre restock — produits avec stock > 0
    const restocked = all.filter(p => p.stock > 0);

    res.json({ success: true, restocked, all });
  } catch (err) { next(err); }
});

// ── Routes utilisateur ────────────────────────────────────────────────────────
router.post('/',                protect, ctrl.subscribe);
router.get('/check/:productId', protect, ctrl.checkSubscription);

module.exports = router;
