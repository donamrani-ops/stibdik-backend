// controllers/pushController.js
const PushSubscription = require('../models/PushSubscription');
const pushService = require('../services/pushService');

// ── GET /api/push/key ─────────────────────────────────────────────────────────
// Retourne la clé publique VAPID (nécessaire au frontend pour s'abonner)
exports.getPublicKey = async (req, res) => {
  res.json({ publicKey: pushService.publicKey() || null });
};

// ── POST /api/push/subscribe ──────────────────────────────────────────────────
exports.subscribe = async (req, res, next) => {
  try {
    const { subscription, prefs } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ message: 'Abonnement invalide' });
    }

    // Upsert : un endpoint = un abonnement
    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        user:      req.user._id,
        endpoint:  subscription.endpoint,
        keys:      subscription.keys,
        userAgent: req.headers['user-agent'] || null,
        ...(prefs ? { prefs } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, message: 'Notifications activées' });
  } catch (error) { next(error); }
};

// ── POST /api/push/unsubscribe ────────────────────────────────────────────────
exports.unsubscribe = async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await PushSubscription.deleteOne({ endpoint, user: req.user._id });
    } else {
      // Désabonner tous les appareils de l'utilisateur
      await PushSubscription.deleteMany({ user: req.user._id });
    }
    res.json({ success: true, message: 'Notifications désactivées' });
  } catch (error) { next(error); }
};

// ── PATCH /api/push/prefs ─────────────────────────────────────────────────────
exports.updatePrefs = async (req, res, next) => {
  try {
    const { prefs } = req.body;
    if (!prefs) return res.status(400).json({ message: 'Préférences requises' });

    await PushSubscription.updateMany(
      { user: req.user._id },
      { $set: { prefs } }
    );
    res.json({ success: true, prefs });
  } catch (error) { next(error); }
};

// ── POST /api/push/test ───────────────────────────────────────────────────────
// Envoyer une notification de test à soi-même
exports.sendTest = async (req, res, next) => {
  try {
    const result = await pushService.sendToUser(req.user._id, {
      title: '🎉 Stibdik',
      body:  'Vos notifications sont activées ! Vous ne raterez plus rien.',
      url:   '/',
    });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};
