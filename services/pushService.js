// services/pushService.js
const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

// Configurer VAPID au démarrage
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:contact@stibdik.ma';

let configured = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
} else {
  console.warn('⚠️ Clés VAPID manquantes — push désactivé');
}

// ── Envoyer une notification à un utilisateur ─────────────────────────────────
// type = 'newMessage' | 'priceDrop' | 'sale' | 'marketing'
async function sendToUser(userId, payload, type) {
  if (!configured) return { sent: 0, failed: 0 };

  // Récupérer les abonnements de l'utilisateur qui ont activé ce type
  const filter = { user: userId };
  if (type) filter['prefs.' + type] = true;

  const subs = await PushSubscription.find(filter);
  let sent = 0, failed = 0;

  const body = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    icon:  payload.icon || '/icon-192.png',
    badge: '/icon-192.png',
    url:   payload.url || '/',
    tag:   payload.tag || type || 'stibdik',
  });

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      }, body);
      sent++;
    } catch (err) {
      failed++;
      // Abonnement expiré/invalide (410 Gone ou 404) → supprimer
      if (err.statusCode === 410 || err.statusCode === 404) {
        await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
      }
    }
  }));

  return { sent, failed };
}

module.exports = { sendToUser, isConfigured: () => configured, publicKey: () => VAPID_PUBLIC };
