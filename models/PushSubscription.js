// models/PushSubscription.js
const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // L'objet subscription renvoyé par le navigateur
  endpoint: {
    type: String,
    required: true,
    unique: true,
  },
  keys: {
    p256dh: { type: String, required: true },
    auth:   { type: String, required: true },
  },
  // Préférences de notification de l'utilisateur
  prefs: {
    newMessage:  { type: Boolean, default: true },
    priceDrop:   { type: Boolean, default: true },
    sale:        { type: Boolean, default: true },
    marketing:   { type: Boolean, default: false },
  },
  userAgent: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
