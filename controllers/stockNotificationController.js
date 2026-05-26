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

    const email    = req.user?.email || req.body.email;
    const userName = req.user?.name  || req.body.userName || 'Client';
    if (!email) return res.status(400).json({ success: false, message: 'Email requis' });

    // Vérifier si déjà abonné
    const existing = await StockNotification.findOne({ product: productId, email });

    if (!existing) {
      // Nouvel abonnement
      await StockNotification.create({
        product: productId, email, userName,
        user: req.user?._id, notified: false
      });
      // Email de confirmation
      const productName = product.nameFr || product.nameAr || 'Produit';
      console.log(`📧 Sending subscription confirmation to ${email} for "${productName}"`);
      emailService.sendRestockSubscriptionConfirmation(email, userName, productName)
        .then(() => console.log(`✅ Confirmation sent to ${email}`))
        .catch(e => console.warn(`❌ Confirmation email failed: ${e.message}`));
    } else if (existing.notified) {
      // Était notifié, on réabonne
      existing.notified = false;
      existing.notifiedAt = null;
      await existing.save();
    }
    // Si déjà abonné et pas notifié → pas de doublon, juste retourner OK

    res.status(200).json({ success: true, message: 'Notification activée' });
  } catch (err) {
    // Duplicate key = déjà abonné — silencieux
    if (err.code === 11000) {
      return res.status(200).json({ success: true, message: 'Déjà inscrit' });
    }
    next(err);
  }
};

// GET /api/stock-notifications/check/:productId
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

// Appelé par productController quand stock 0 → >0
exports.notifyOnRestock = async (productId, productName) => {
  try {
    const mongoose = require('mongoose');
    const pid = mongoose.Types.ObjectId.isValid(productId)
      ? new mongoose.Types.ObjectId(String(productId))
      : productId;

    const subs = await StockNotification.find({ product: pid, notified: false });
    console.log(`📦 Restock "${productName}": ${subs.length} abonné(s)`);
    if (!subs.length) return;

    for (const sub of subs) {
      try {
        console.log(`📧 Envoi restock email → ${sub.email}`);
        await emailService.sendRestockNotification(sub.email, sub.userName, productName, productId);
        sub.notified   = true;
        sub.notifiedAt = new Date();
        await sub.save();
        console.log(`✅ Restock email envoyé → ${sub.email}`);
      } catch (e) {
        console.warn(`❌ Restock email échoué (${sub.email}): ${e.message}`);
      }
    }
    console.log(`✅ ${subs.length} restock notification(s) traitée(s) pour "${productName}"`);
  } catch (err) {
    console.error('notifyOnRestock error:', err.message);
  }
};
