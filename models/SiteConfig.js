const mongoose = require('mongoose');

// Modèle générique pour la config du site (clé/valeur)
const siteConfigSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true, trim: true },
  value:     { type: mongoose.Schema.Types.Mixed, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('SiteConfig', siteConfigSchema);
