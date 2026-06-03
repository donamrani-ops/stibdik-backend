const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const validator = require('validator');

const userSchema = new mongoose.Schema({

  // ── Informations de base ──────────────────────────────────────────────────
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
    select: false
  },

  // ── Rôle et permissions ───────────────────────────────────────────────────
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

  // ── Informations vendor ───────────────────────────────────────────────────
  shopName:        { type: String, trim: true, maxlength: [100, 'Max 100 chars'] },
  shopDescription: { type: String, trim: true, maxlength: [500, 'Max 500 chars'] },
  shopLogo:        { type: String, default: null },

  // ── Vérifications ─────────────────────────────────────────────────────────
  isEmailVerified:          { type: Boolean, default: false },
  isPhoneVerified:          { type: Boolean, default: false },
  emailVerificationToken:   String,
  emailVerificationExpires: Date,

  // ── Reset mot de passe ────────────────────────────────────────────────────
  resetPasswordToken:   { type: String, default: undefined },
  resetPasswordExpires: { type: Date,   default: undefined },

  // ── Avatar ────────────────────────────────────────────────────────────────
  avatar: { type: String, default: null },

  // ── Adresses ──────────────────────────────────────────────────────────────
  addresses: [{
    label:      { type: String, default: 'Maison' },
    fullName:   String,
    phone:      String,
    address:    String,
    city:       String,
    postalCode: String,
    isDefault:  { type: Boolean, default: false }
  }],

  // ── Statistiques vendor ───────────────────────────────────────────────────
  stats: {
    totalProducts: { type: Number, default: 0 },
    totalOrders:   { type: Number, default: 0 },
    totalRevenue:  { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalReviews:  { type: Number, default: 0 }
  },

  // ── Métadonnées ───────────────────────────────────────────────────────────
  lastLogin:  Date,
  loginCount: { type: Number, default: 0 },

}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true }
});

// ── Index ─────────────────────────────────────────────────────────────────────
userSchema.index({ email: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ createdAt: -1 });

// ── Pre-save : hasher le password ─────────────────────────────────────────────
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt    = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ── Méthodes d'instance ───────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getInitials = function() {
  return this.name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
};

userSchema.methods.getPublicProfile = function() {
  return {
    id:              this._id,
    name:            this.name,
    email:           this.email,
    role:            this.role,
    avatar:          this.avatar || this.getInitials(),
    shopName:        this.shopName,
    shopDescription: this.shopDescription,
    shopLogo:        this.shopLogo,
    stats:           this.role === 'vendor' ? this.stats : undefined,
    createdAt:       this.createdAt
  };
};

userSchema.methods.incrementStats = async function(field, value = 1) {
  if (this.role !== 'vendor') return;
  this.stats[field] = (this.stats[field] || 0) + value;
  await this.save();
};

// ── Méthodes statiques ────────────────────────────────────────────────────────
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.getActiveVendors = function() {
  return this.find({ role: 'vendor', status: 'active' })
    .select('name shopName shopDescription shopLogo stats')
    .sort('-stats.averageRating');
};

// ── Virtuals ──────────────────────────────────────────────────────────────────
userSchema.virtual('products', {
  ref: 'Product', localField: '_id', foreignField: 'vendor', count: true
});

const User = mongoose.model('User', userSchema);
module.exports = User;
