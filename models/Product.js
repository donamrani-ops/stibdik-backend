// ═══════════════════════════════════════════════════════════
//  MODEL: PRODUCT
//  Gestion des produits (ecommerce, classifieds, rfq)
// ═══════════════════════════════════════════════════════════

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // Informations de base
  nameFr: {
    type: String,
    required: [true, 'Le nom français est requis'],
    trim: true,
    maxlength: [200, 'Le nom ne peut pas dépasser 200 caractères']
  },
  nameAr: {
    type: String,
    trim: true,
    maxlength: [200, 'الاسم لا يمكن أن يتجاوز 200 حرفًا']
  },
  
  // Type de produit
  type: {
    type: String,
    enum: ['ecommerce', 'classifieds', 'rfq'],
    default: 'ecommerce'
  },
  
  // Prix
  price: {
    type: Number,
    required: function() { return this.type !== 'rfq'; },
    min: [0, 'Le prix ne peut pas être négatif']
  },
  original: {
    type: Number,
    min: [0, 'Le prix original ne peut pas être négatif']
  },
  currency: {
    type: String,
    default: 'DH'
  },
  
  // Description
  descFr: {
    type: String,
    trim: true,
    maxlength: [5000, 'La description ne peut pas dépasser 5000 caractères']
  },
  descAr: {
    type: String,
    trim: true,
    maxlength: [5000, 'الوصف لا يمكن أن يتجاوز 5000 حرفًا']
  },
  
  // Condition
  condition: {
    type: String,
    enum: ['Neuf', 'Comme neuf', 'Très bon état', 'Bon état', 'Acceptable'],
    default: 'Bon état'
  },
  conditionAr: {
    type: String,
    default: 'حالة جيدة'
  },
  
  // Catégorie
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'La catégorie est requise']
  },
  
  // Vendor
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Le vendeur est requis']
  },
  vendorName: String, // Dénormalisé pour performance
  
  // Images
  images: [{
    url: {
      type: String,
      required: true
    },
    publicId: String, // Cloudinary public_id pour suppression
    isMain: {
      type: Boolean,
      default: false
    }
  }],
  
  // Stock & disponibilité
  stock: {
    type: Number,
    default: 0,
    min: [0, 'Le stock ne peut pas être négatif']
  },
  lowStockThreshold: {
    type: Number,
    default: 5
  },
  
  // Variantes (tailles, couleurs, etc.)
  sizes: [String],
  colors: [String],
  variants: [{
    name: String,
    options: [String],
    price: Number
  }],
  
  // Localisation
  city: {
    type: String,
    required: [true, 'La ville est requise'],
    trim: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: '2dsphere'
    }
  },
  
  // Statut
  status: {
    type: String,
    enum: ['active', 'pending', 'suspended', 'sold', 'expired'],
    default: 'active'
  },
  
  // Badges
  badge: {
    type: String,
    enum: ['Sale', 'Hot', 'New', 'Featured', ''],
    default: ''
  },
  
  // Métriques
  views: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviews: {
    type: Number,
    default: 0
  },
  favorites: {
    type: Number,
    default: 0
  },
  
  // SEO
  slug: {
    type: String,
    unique: true,
    sparse: true
  },
  metaDescription: String,
  metaKeywords: [String],
  
  // Expiration (pour les annonces classifieds)
  expiresAt: {
    type: Date,
    default: function() {
      if (this.type === 'classifieds') {
        const date = new Date();
        date.setDate(date.getDate() + 90); // 90 jours
        return date;
      }
      return null;
    }
  },
  
  // Statistiques avancées
  analytics: {
    clicksToContact: { type: Number, default: 0 },
    addedToCart: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 }
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ═══════════════════════════════════════════════════════════
//  INDEXES
// ═══════════════════════════════════════════════════════════

productSchema.index({ vendor: 1, status: 1 });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ city: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ slug: 1 });
productSchema.index({ 'location.coordinates': '2dsphere' });

// Index texte pour recherche
productSchema.index({ 
  nameFr: 'text', 
  nameAr: 'text', 
  descFr: 'text', 
  descAr: 'text' 
});

// ═══════════════════════════════════════════════════════════
//  MIDDLEWARE
// ═══════════════════════════════════════════════════════════

// Générer slug avant save
productSchema.pre('save', function(next) {
  if (this.isModified('nameFr') && !this.slug) {
    this.slug = this.nameFr
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 100) + '-' + this._id.toString().substring(0, 8);
  }
  next();
});

// Incrémenter stats vendor après save
productSchema.post('save', async function(doc) {
  if (doc.isNew) {
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(doc.vendor, {
      $inc: { 'stats.totalProducts': 1 }
    });
  }
});

// Décrémenter stats vendor après suppression
productSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(doc.vendor, {
      $inc: { 'stats.totalProducts': -1 }
    });
  }
});

// ═══════════════════════════════════════════════════════════
//  MÉTHODES D'INSTANCE
// ═══════════════════════════════════════════════════════════

// Incrémenter vues
productSchema.methods.incrementViews = async function() {
  this.views += 1;
  await this.save({ validateBeforeSave: false });
};

// Vérifier stock faible
productSchema.methods.isLowStock = function() {
  return this.stock > 0 && this.stock <= this.lowStockThreshold;
};

// Obtenir image principale
productSchema.methods.getMainImage = function() {
  const mainImg = this.images.find(img => img.isMain);
  return mainImg ? mainImg.url : (this.images[0]?.url || null);
};

// Calculer la réduction en %
productSchema.methods.getDiscountPercent = function() {
  if (!this.original || this.original <= this.price) return 0;
  return Math.round(((this.original - this.price) / this.original) * 100);
};

// ═══════════════════════════════════════════════════════════
//  MÉTHODES STATIQUES
// ═══════════════════════════════════════════════════════════

// Recherche avancée
productSchema.statics.advancedSearch = function(filters = {}) {
  const {
    query,
    category,
    city,
    minPrice,
    maxPrice,
    condition,
    type,
    vendor,
    status = 'active',
    sort = '-createdAt',
    page = 1,
    limit = 20
  } = filters;

  const searchQuery = { status };

  // Recherche texte
  if (query) {
    searchQuery.$text = { $search: query };
  }

  // Filtres
  if (category) searchQuery.category = category;
  if (city) searchQuery.city = new RegExp(city, 'i');
  if (condition) searchQuery.condition = condition;
  if (type) searchQuery.type = type;
  if (vendor) searchQuery.vendor = vendor;
  
  // Prix
  if (minPrice || maxPrice) {
    searchQuery.price = {};
    if (minPrice) searchQuery.price.$gte = minPrice;
    if (maxPrice) searchQuery.price.$lte = maxPrice;
  }

  const skip = (page - 1) * limit;

  return this.find(searchQuery)
    .populate('vendor', 'name shopName shopLogo')
    .populate('category', 'name icon')
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

// Produits similaires
productSchema.statics.findSimilar = function(productId, category, limit = 6) {
  return this.find({
    _id: { $ne: productId },
    category,
    status: 'active'
  })
    .limit(limit)
    .select('nameFr nameAr price images rating reviews');
};

// Trending products
productSchema.statics.getTrending = function(limit = 10) {
  return this.find({ status: 'active' })
    .sort('-views -rating')
    .limit(limit)
    .populate('vendor', 'name shopName');
};

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
