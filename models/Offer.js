const mongoose = require('mongoose');

const counterOfferSchema = new mongoose.Schema({
  price:     { type: Number, required: true },
  message:   { type: String, default: '' },
  by:        { type: String, enum: ['buyer','vendor'], required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const offerSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productSnapshot: {
    nameFr: String, nameAr: String,
    price:  Number, image: String
  },
  vendor:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  buyer:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  buyerName:  { type: String, default: '' },
  buyerEmail: { type: String, default: '' },

  // Prix proposé par l'acheteur
  offerPrice: { type: Number, required: true, min: 1 },
  // Message optionnel
  message:    { type: String, default: '', maxlength: 500 },

  // Statut
  status: {
    type: String,
    enum: ['pending','accepted','declined','countered','expired','withdrawn'],
    default: 'pending'
  },

  // Historique des négociations
  history: [counterOfferSchema],

  // Dernière contre-offre du vendeur
  counterPrice:   { type: Number, default: null },
  counterMessage: { type: String, default: '' },

  // Expiration (48h par défaut)
  expiresAt: { type: Date, default: () => new Date(Date.now() + 48*60*60*1000) },

  // Notifications
  isUnreadByVendor: { type: Boolean, default: true },
  isUnreadByBuyer:  { type: Boolean, default: false },
  vendorNotified:   { type: Boolean, default: false },

}, { timestamps: true });

offerSchema.index({ vendor: 1, status: 1 });
offerSchema.index({ buyer:  1, status: 1 });
offerSchema.index({ product: 1 });
offerSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-expire

offerSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

module.exports = mongoose.model('Offer', offerSchema);
