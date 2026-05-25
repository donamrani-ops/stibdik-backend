const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  nameFr:      { type: String, required: true, trim: true, maxlength: 200 },
  nameAr:      { type: String, trim: true, maxlength: 200, default: '' },
  descFr:      { type: String, trim: true, maxlength: 3000, default: '' },
  descAr:      { type: String, trim: true, maxlength: 3000, default: '' },
  category:    { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  subCategory: { type: String, trim: true, default: '' },
  type:        { type: String, enum: ['ecommerce','classifieds','rfq'], default: 'ecommerce' },
  price:       { type: Number, required: true, min: 0 },
  original:    { type: Number, default: 0 },
  stock:       { type: Number, default: 1, min: 0 },
  sizes:       { type: [mongoose.Schema.Types.Mixed], default: [] },
  condition:   { type: String, default: 'Bon état' },
  brand:       { type: String, trim: true, default: '' },
  city:        { type: String, trim: true, default: '' },
  images: [{
    url:      { type: String },
    publicId: { type: String },
    isMain:   { type: Boolean, default: false },
    status:   { type: String, default: 'active' }
  }],
  vendor:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vendorName:  { type: String, default: '' },
  views:       { type: Number, default: 0 },
  sold:        { type: Number, default: 0 },
  rating:      { type: Number, default: 0 },
  reviews:     { type: Number, default: 0 },
  status:      { type: String, enum: ['active','inactive','pending','rejected'], default: 'active' },
  isBoosted:   { type: Boolean, default: false },
  boostExpiry: { type: Date },
}, { timestamps: true });

productSchema.index({ nameFr: 'text', nameAr: 'text', descFr: 'text', brand: 'text' });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ vendor: 1, status: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ views: -1 });

productSchema.methods.incrementViews = async function() {
  this.views = (this.views || 0) + 1;
  return this.save();
};

productSchema.methods.getMainImage = function() {
  if (!this.images || this.images.length === 0) return null;
  return this.images.find(img => img.isMain) || this.images[0];
};

productSchema.methods.getActiveImages = function() {
  if (!this.images) return [];
  return this.images.filter(img => img.status !== 'deleted');
};

// ─── Cache slug→ObjectId pour éviter des requêtes répétées ──────────────────
const _slugCache = {};

// ─── advancedSearch ──────────────────────────────────────────────────────────
productSchema.statics.advancedSearch = async function(params) {
  const {
    category, city, minPrice, maxPrice, type,
    sort = '-createdAt', page = 1, limit = 20,
    vendor, status = 'active', query
  } = params;

  const filter = { status };

  if (category) {
    // Déjà un ObjectId valide → utiliser directement
    if (mongoose.Types.ObjectId.isValid(category) && String(category).length === 24) {
      filter.category = new mongoose.Types.ObjectId(String(category));
    } else {
      // C'est un slug → résoudre via cache ou requête DB
      if (_slugCache[category]) {
        filter.category = _slugCache[category];
      } else {
        try {
          // Chercher dans la collection categories directement (sans passer par le model)
          const db = mongoose.connection.db;
          const cat = await db.collection('categories').findOne(
            { slug: category },
            { projection: { _id: 1 } }
          );
          if (cat) {
            _slugCache[category] = cat._id;
            filter.category = cat._id;
          }
          // Si slug inconnu → ne pas filtrer par catégorie
        } catch(e) {
          // Accès DB échoué → ignorer le filtre catégorie silencieusement
        }
      }
    }
  }

  if (city)                 filter.city = new RegExp(city, 'i');
  if (minPrice || maxPrice) filter.price = {};
  if (minPrice)             filter.price.$gte = Number(minPrice);
  if (maxPrice)             filter.price.$lte = Number(maxPrice);
  if (type)                 filter.type = type;
  if (vendor)               filter.vendor = vendor;
  if (query)                filter.$text = { $search: query };

  const sortObj = sort.startsWith('-')
    ? { [sort.slice(1)]: -1 }
    : { [sort]: 1 };

  const skip = (Number(page) - 1) * Number(limit);

  const products = await this.find(filter)
    .sort(sortObj)
    .skip(skip)
    .limit(Number(limit))
    .populate('vendor',   'name shopName shopLogo phone')
    .populate('category', 'name nameAr slug icon')
    .lean();

  return products;
};

productSchema.statics.findSimilar = async function(excludeId, categoryId, limit = 4) {
  return this.find({ _id: { $ne: excludeId }, category: categoryId, status: 'active' })
    .sort('-views')
    .limit(limit)
    .populate('vendor', 'name shopName shopLogo')
    .lean();
};

productSchema.statics.getTrending = async function(limit = 10) {
  return this.find({ status: 'active' })
    .sort({ views: -1, sold: -1 })
    .limit(limit)
    .populate('vendor',   'name shopName shopLogo')
    .populate('category', 'name nameAr slug icon')
    .lean();
};

module.exports = mongoose.model('Product', productSchema);
