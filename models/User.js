// ═══════════════════════════════════════════════════════════
//  MODEL: USER
//  Gestion des utilisateurs avec rôles (admin, vendor, customer)
// ═══════════════════════════════════════════════════════════

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const userSchema = new mongoose.Schema({
  // Informations de base
  name: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères']
  },
  email: {
    type: String,
    required: [true, "L'email est requis"],
    unique: true,
    lowercase: true,
    trim: true,
    validate: [validator.isEmail, 'Email invalide']
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^(\+212|0)[5-7]\d{8}$/.test(v.replace(/\s/g, ''));
      },
      message: 'Numéro de téléphone marocain invalide'
    }
  },
  password: {
    type: String,
    required: [true, 'Le mot de passe est requis'],
    minlength: [6, 'Le mot de passe doit contenir au moins 6 caractères'],
    select: false // Ne pas retourner le password par défaut
  },
  
  // Rôle et permissions
  role: {
    type: String,
    enum: ['customer', 'vendor', 'admin'],
    default: 'customer'
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'banned', 'suspended'],
    default: 'active'
  },
  
  // Informations vendor (si role = vendor)
  shopName: {
    type: String,
    trim: true,
    maxlength: [100, 'Le nom de la boutique ne peut pas dépasser 100 caractères']
  },
  shopDescription: {
    type: String,
    trim: true,
    maxlength: [500, 'La description ne peut pas dépasser 500 caractères']
  },
  shopLogo: {
    type: String, // URL Cloudinary
    default: null
  },

  // Wishlist : liste de produits favoris (références ObjectId vers Product)
  // Stockée directement sur le user pour récupération rapide en 1 seul .populate()
  // L'index permet des queries efficaces "est-ce que ce produit est dans la wishlist d'un user ?"
  wishlist: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }],
    default: []
  },
  
  // Vérifications
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  
  // Reset password
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Avatar
  avatar: {
    type: String, // URL ou initiales
    default: null
  },
  
  // Adresses
  addresses: [{
    label: { type: String, default: 'Maison' }, // Maison, Bureau, etc.
    fullName: String,
    phone: String,
    address: String,
    city: String,
    postalCode: String,
    isDefault: { type: Boolean, default: false }
  }],
  
  // Statistiques (pour vendors)
  stats: {
    totalProducts: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 }
  },
  
  // Métadonnées
  lastLogin: Date,
  loginCount: { type: Number, default: 0 },
  
}, {
  timestamps: true, // createdAt, updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ═══════════════════════════════════════════════════════════
//  INDEXES POUR PERFORMANCE
// ═══════════════════════════════════════════════════════════

userSchema.index({ email: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ createdAt: -1 });

// ═══════════════════════════════════════════════════════════
//  MIDDLEWARE PRE-SAVE: HASHER LE PASSWORD
// ═══════════════════════════════════════════════════════════

userSchema.pre('save', async function(next) {
  // Hash password seulement si modifié
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ═══════════════════════════════════════════════════════════
//  MÉTHODES D'INSTANCE
// ═══════════════════════════════════════════════════════════

// Comparer le password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Générer avatar initiales
userSchema.methods.getInitials = function() {
  return this.name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

// Obtenir les infos publiques
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    avatar: this.avatar || this.getInitials(),
    shopName: this.shopName,
    shopDescription: this.shopDescription,
    shopLogo: this.shopLogo,
    addresses: this.addresses,
    status: this.status,
    isVerified: this.isVerified,
    stats: this.role === 'vendor' ? this.stats : undefined,
    createdAt: this.createdAt
  };
};

// Incrémenter stats vendor
userSchema.methods.incrementStats = async function(field, value = 1) {
  if (this.role !== 'vendor') return;
  this.stats[field] = (this.stats[field] || 0) + value;
  await this.save();
};

// ═══════════════════════════════════════════════════════════
//  MÉTHODES STATIQUES
// ═══════════════════════════════════════════════════════════

// Trouver par email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Obtenir les vendors actifs
userSchema.statics.getActiveVendors = function() {
  return this.find({ role: 'vendor', status: 'active' })
    .select('name shopName shopDescription shopLogo stats')
    .sort('-stats.averageRating');
};

// Statistiques globales
userSchema.statics.getGlobalStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
        active: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        }
      }
    }
  ]);
  
  return stats.reduce((acc, item) => {
    acc[item._id] = {
      total: item.count,
      active: item.active,
      pending: item.pending
    };
    return acc;
  }, {});
};

// ═══════════════════════════════════════════════════════════
//  VIRTUALS
// ═══════════════════════════════════════════════════════════

// Nombre de produits (populate depuis Product)
userSchema.virtual('products', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'vendor',
  count: true
});

const User = mongoose.model('User', userSchema);

module.exports = User;
