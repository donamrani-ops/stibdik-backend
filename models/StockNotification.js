const mongoose = require('mongoose');

const stockNotificationSchema = new mongoose.Schema({
  product:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  email:     { type: String, required: true, trim: true, lowercase: true },
  userName:  { type: String, default: '' },
  notified:  { type: Boolean, default: false },
  notifiedAt:{ type: Date },
}, { timestamps: true });

// Un email par produit max
stockNotificationSchema.index({ product: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('StockNotification', stockNotificationSchema);
