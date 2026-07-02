const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Le nom de la marque est obligatoire'],
    trim: true,
    unique: true,
  },
  // Nom normalisé (minuscules, sans espaces/apostrophes) pour matcher les produits
  normalizedName: {
    type: String,
    index: true,
  },
  slug: {
    type: String,
    trim: true,
    lowercase: true,
    index: true,
  },
  logo: {
    type: String, // URL Cloudinary
    default: '',
  },
  displayOrder: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

// Génère normalizedName + slug avant sauvegarde
brandSchema.pre('save', function(next) {
  if (this.name) {
    this.normalizedName = this.name.toLowerCase().trim().replace(/['\u2019\s]/g, '');
    if (!this.slug) {
      this.slug = this.name.toLowerCase().trim()
        .replace(/['\u2019]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
  }
  next();
});

// Helper statique : normaliser un nom (utilisé pour matcher les produits)
brandSchema.statics.normalize = function(name) {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/['\u2019\s]/g, '');
};

module.exports = mongoose.model('Brand', brandSchema);
