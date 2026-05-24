const mongoose = require('mongoose');

// ─── Définition des tailles par type de catégorie ────────────────────────────
// Le frontend envoie sizes: ['S','M','L'] ou [38,39,40] selon la catégorie
// On stocke tel quel en tableau de Mixed pour supporter les deux formats

const productSchema = new mongoose.Schema({
  // ── Identification ───────────────────────────────────────────────────────
  nameFr:      { type: String, required: true, trim: true, maxlength: 200 },
  nameAr:      { type: String, trim: true, maxlength: 200, default: '' },
  descFr:      { type: String, trim: true, maxlength: 3000, default: '' },
  descAr:      { type: String, trim: true, maxlength: 3000, default: '' },

  // ── Catégorie & type ─────────────────────────────────────────────────────
  category:    { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  subCategory: { type: String, trim: true, default: '' },
  type:        { type: String, enum: ['ecommerce','classifieds','rfq'], default: 'ecommerce' },

  // ── Prix ─────────────────────────────────────────────────────────────────
  price:       { type: Number, required: true, min: 0 },
  original:    { type: Number, default: 0 },

  // ── Stock ────────────────────────────────────────────────────────────────
  stock:       { type: Number, default: 1, min: 0 },

  // ── TAILLES ──────────────────────────────────────────────────────────────
  // Tableau mixte : ['S','M','L','XL','XXL'] pour vêtements
  //                 [36,37,38,39,40,41,42] pour chaussures
  // Vide [] = pas de tailles applicables (électronique, maison, etc.)
  sizes: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
    validate: {
      validator: function(arr) {
        if (!arr || arr.length === 0) return true;
        // Tous strings ou tous nombres
        const allStr = arr.every(s => typeof s === 'string');
        const allNum = arr.every(s => typeof s === 'number');
        return allStr || allNum;
      },
      message: 'sizes doit contenir uniquement des strings (S,M,L) ou des nombres (36,37,38)'
    }
  },

  // ── Attributs produit ────────────────────────────────────────────────────
  condition:   { type: String, default: 'Bon état' },
  brand:       { type: String, trim: true, default: '' },
  city:        { type: String, trim: true, default: '' },

  // ── Images ───────────────────────────────────────────────────────────────
  images: [{
    url:       { type: String },
    publicId:  { type: String },
    isMain:    { type: Boolean, default: false },
    status:    { type: String, default: 'active' }
  }],

  // ── Vendeur ──────────────────────────────────────────────────────────────
  vendor:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vendorName:  { type: String, default: '' },

  // ── Stats ────────────────────────────────────────────────────────────────
  views:       { type: Number, default: 0 },
  sold:        { type: Number, default: 0 },
  rating:      { type: Number, default: 0 },
  reviews:     { type: Number, default: 0 },

  // ── Statut ───────────────────────────────────────────────────────────────
  status:      { type: String, enum: ['active','inactive','pending','rejected'], default: 'active' },

  // ── Boost ────────────────────────────────────────────────────────────────
  isBoosted:   { type: Boolean, default: false },
  boostExpiry: { type: Date },

}, { timestamps: true });

// ─── Index pour la recherche ─────────────────────────────────────────────────
productSchema.index({ nameFr: 'text', nameAr: 'text', descFr: 'text', brand: 'text' });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ vendor: 1, status: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ views: -1 });

// ─── Méthodes ────────────────────────────────────────────────────────────────
productSchema.methods.incrementViews = async function() {
  this.views = (this.views || 0) + 1;
  return this.save();
};

// Recherche avancée
productSchema.statics.advancedSearch = async function(params) {
  const { category, city, minPrice, maxPrice, type, sort = '-createdAt',
          page = 1, limit = 20, vendor, status = 'active', query } = params;

  const filter = { status };
  if (category)               filter.category = category;
  if (city)                   filter.city = new RegExp(city, 'i');
  if (minPrice || maxPrice)   filter.price = {};
  if (minPrice)               filter.price.$gte = Number(minPrice);
  if (maxPrice)               filter.price.$lte = Number(maxPrice);
  if (type)                   filter.type = type;
  if (vendor)                 filter.vendor = vendor;
  if (query)                  filter.$text = { $search: query };

  const sortObj = sort.startsWith('-')
    ? { [sort.slice(1)]: -1 }
    : { [sort]: 1 };

  const skip = (Number(page) - 1) * Number(limit);
  const [products, total] = await Promise.all([
    this.find(filter).sort(sortObj).skip(skip).limit(Number(limit))
      .populate('vendor',   'name shopName shopLogo phone')
      .populate('category', 'name nameAr slug icon')
      .lean(),
    this.countDocuments(filter)
  ]);

  return { products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
};

// Produits similaires
productSchema.statics.findSimilar = async function(excludeId, categoryId, limit = 4) {
  return this.find({ _id: { $ne: excludeId }, category: categoryId, status: 'active' })
    .sort('-views')
    .limit(limit)
    .populate('vendor', 'name shopName shopLogo')
    .lean();
};

module.exports = mongoose.model('Product', productSchema);
