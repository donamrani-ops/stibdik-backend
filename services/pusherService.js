// Service Pusher — temps réel pour le chat
// Variables d'env requises : PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER

let pusherInstance = null;

function getPusher() {
  if (pusherInstance) return pusherInstance;
  if (!process.env.PUSHER_APP_ID) {
    // Mode dégradé sans Pusher — polling seul
    return { trigger: () => Promise.resolve() };
  }
  const Pusher = require('pusher');
  pusherInstance = new Pusher({
    appId:   process.env.PUSHER_APP_ID,
    key:     process.env.PUSHER_KEY,
    secret:  process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER || 'eu',
    useTLS:  true,
  });
  console.log('✅ Pusher configuré (cluster:', process.env.PUSHER_CLUSTER, ')');
  return pusherInstance;
}

module.exports = {
  trigger: (channel, event, data) => {
    try { return getPusher().trigger(channel, event, data); }
    catch(e) { console.warn('Pusher trigger failed:', e.message); return Promise.resolve(); }
  }
};
