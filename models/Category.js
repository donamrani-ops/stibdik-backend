// ═══════════════════════════════════════════════════════════
//  MODEL: CATEGORY
//  Catégories de produits (Mode, Électronique, etc.)
// ═══════════════════════════════════════════════════════════

const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  // Noms multilingues
  name: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
    unique: true
  },
  nameAr: {
    type: String,
    trim: true
  },
  
  // Icône
  icon: {
    type: String,
    default: '🏷️'
  },
  
  // Slug pour URLs
  slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  
  // Description
  description: {
    type: String,
    maxlength: [500, 'La description ne peut pas dépasser 500 caractères']
  },
  descriptionAr: {
    type: String,
    maxlength: [500, 'الوصف لا يمكن أن يتجاوز 500 حرفًا']
  },
  
  // Image de couverture
  image: {
    url: String,
    publicId: String
  },
  
  // Hiérarchie
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  level: {
    type: Number,
    default: 0
  },
  
  // Ordre d'affichage
  order: {
    type: Number,
    default: 0
  },
  
  // Statut
  active: {
    type: Boolean,
    default: true
  },
  
  // Featured (mise en avant)
  featured: {
    type: Boolean,
    default: false
  },
  
  // SEO
  metaTitle: String,
  metaDescription: String,
  metaKeywords: [String],
  
  // Statistiques
  productCount: {
    type: Number,
    default: 0
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ═══════════════════════════════════════════════════════════
//  INDEXES
// ═══════════════════════════════════════════════════════════

categorySchema.index({ slug: 1 });
categorySchema.index({ parent: 1 });
categorySchema.index({ active: 1, featured: -1 });
categorySchema.index({ order: 1 });

// ═══════════════════════════════════════════════════════════
//  VIRTUALS
// ═══════════════════════════════════════════════════════════

// Sous-catégories
categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent'
});

// Produits de la catégorie
categorySchema.virtual('products', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'category'
});

// ═══════════════════════════════════════════════════════════
//  MIDDLEWARE
// ═══════════════════════════════════════════════════════════

// Générer slug avant save
categorySchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  }
  next();
});

// Calculer level basé sur parent
categorySchema.pre('save', async function(next) {
  if (this.isModified('parent')) {
    if (this.parent) {
      const parent = await this.constructor.findById(this.parent);
      this.level = parent ? parent.level + 1 : 0;
    } else {
      this.level = 0;
    }
  }
  next();
});

// ═══════════════════════════════════════════════════════════
//  MÉTHODES D'INSTANCE
// ═══════════════════════════════════════════════════════════

// Obtenir le chemin complet de la catégorie
categorySchema.methods.getPath = async function() {
  const path = [this];
  let current = this;
  
  while (current.parent) {
    current = await this.constructor.findById(current.parent);
    if (current) path.unshift(current);
  }
  
  return path;
};

// Obtenir toutes les sous-catégories (récursif)
categorySchema.methods.getAllChildren = async function() {
  const children = await this.constructor.find({ parent: this._id });
  const allChildren = [...children];
  
  for (const child of children) {
    const subChildren = await child.getAllChildren();
    allChildren.push(...subChildren);
  }
  
  return allChildren;
};

// Mettre à jour le compteur de produits
categorySchema.methods.updateProductCount = async function() {
  const Product = mongoose.model('Product');
  const count = await Product.countDocuments({ 
    category: this._id, 
    status: 'active' 
  });
  this.productCount = count;
  await this.save();
};

// ═══════════════════════════════════════════════════════════
//  MÉTHODES STATIQUES
// ═══════════════════════════════════════════════════════════

// Obtenir arborescence complète
categorySchema.statics.getTree = async function() {
  const categories = await this.find({ active: true }).sort('order');
  const tree = [];
  const map = {};
  
  // Créer une map de toutes les catégories
  categories.forEach(cat => {
    map[cat._id] = { ...cat.toObject(), children: [] };
  });
  
  // Construire l'arbre
  categories.forEach(cat => {
    if (cat.parent) {
      if (map[cat.parent]) {
        map[cat.parent].children.push(map[cat._id]);
      }
    } else {
      tree.push(map[cat._id]);
    }
  });
  
  return tree;
};

// Catégories principales
categorySchema.statics.getMainCategories = function() {
  return this.find({ parent: null, active: true })
    .sort('order')
    .select('name nameAr icon slug productCount');
};

// Catégories featured
categorySchema.statics.getFeatured = function(limit = 8) {
  return this.find({ featured: true, active: true })
    .sort('order')
    .limit(limit)
    .select('name nameAr icon slug image productCount');
};

// Recherche par slug
categorySchema.statics.findBySlug = function(slug) {
  return this.findOne({ slug, active: true });
};

// Mettre à jour tous les compteurs
categorySchema.statics.updateAllProductCounts = async function() {
  const categories = await this.find();
  const Product = mongoose.model('Product');
  
  for (const category of categories) {
    const count = await Product.countDocuments({ 
      category: category._id, 
      status: 'active' 
    });
    category.productCount = count;
    await category.save();
  }
};

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
