// models/Otp.js
const mongoose = require('mongoose');
const crypto   = require('crypto');

const otpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    index: true,
    trim: true,
  },
  // Code hashé (jamais stocké en clair)
  codeHash: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    // TTL index — MongoDB supprime automatiquement le document à expiration
    index: { expires: 0 },
  },
  attempts: {
    type: Number,
    default: 0,
  },
  // Anti-spam : nombre d'envois pour ce numéro
  sendCount: {
    type: Number,
    default: 1,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  // IP de la demande (détection abus)
  requestIp: {
    type: String,
    default: null,
  },
}, { timestamps: true });

// Hasher un code OTP
otpSchema.statics.hashCode = function(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
};

// Vérifier un code
otpSchema.methods.verifyCode = function(code) {
  const hash = crypto.createHash('sha256').update(String(code)).digest('hex');
  return hash === this.codeHash;
};

module.exports = mongoose.model('Otp', otpSchema);
