const StockNotification = require('../models/StockNotification');
const Product           = require('../models/Product');
const emailService      = require('../services/emailService');

// POST /api/stock-notifications — s'abonner
exports.subscribe = async (req, res, next) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ success: false, message: 'productId requis' });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    if (product.stock > 0) return res.status(400).json({ success: false, message: 'Produit déjà disponible' });

    const email    = req.user?.email || req.body.email;
    const userName = req.user?.name  || req.body.userName || 'Client';
    if (!email) return res.status(400).json({ success: false, message: 'Email requis' });

    // Upsert — pas de doublon
    await StockNotification.findOneAndUpdate(
      { product: productId, email },
      { product: productId, email, userName, user: req.user?._id, notified: false },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: 'Notification activée' });
  } catch (err) { next(err); }
};

// GET /api/stock-notifications/check/:productId — vérifier si déjà abonné
exports.checkSubscription = async (req, res, next) => {
  try {
    const email = req.user?.email;
    if (!email) return res.json({ success: true, subscribed: false });
    const existing = await StockNotification.findOne({
      product: req.params.productId, email, notified: false
    });
    res.json({ success: true, subscribed: !!existing });
  } catch (err) { next(err); }
};

// Appelé par productController.updateProduct quand stock passe de 0 à > 0
exports.notifyOnRestock = async (productId, productName) => {
  try {
    const subs = await StockNotification.find({ product: productId, notified: false });
    if (!subs.length) return;

    await Promise.all(subs.map(async (sub) => {
      try {
        await emailService.sendRestockNotification(sub.email, sub.userName, productName, productId);
        sub.notified  = true;
        sub.notifiedAt = new Date();
        await sub.save();
      } catch (e) { console.warn('Restock email failed:', e.message); }
    }));

    console.log(`✅ ${subs.length} notification(s) restock envoyée(s) pour ${productName}`);
  } catch (err) {
    console.error('notifyOnRestock error:', err.message);
  }
};
