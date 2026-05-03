// Model: Quote (Demande de devis / RFQ)
const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
  // Lien vers le produit
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Le produit est obligatoire']
  },
  // Snapshot du produit (au cas où il est supprimé après)
  productSnapshot: {
    nameFr: String,
    nameAr: String,
    image: String,
    type: String
  },

  // Vendeur destinataire (récupéré automatiquement depuis product.vendor)
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Demandeur (peut être anonyme ou connecté)
  requester: {
    name: {
      type: String,
      required: [true, 'Le nom est obligatoire'],
      trim: true,
      maxlength: 100
    },
    email: {
      type: String,
      required: [true, "L'email est obligatoire"],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Email invalide']
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30
    },
    // Si l'utilisateur est connecté on stocke son ID en plus
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },

  // Détails de la demande
  quantity: {
    type: Number,
    required: [true, 'La quantité est obligatoire'],
    min: [1, 'La quantité doit être au moins 1']
  },
  message: {
    type: String,
    required: [true, 'Le message est obligatoire'],
    trim: true,
    maxlength: 2000
  },

  // Workflow
  status: {
    type: String,
    enum: ['new', 'replied', 'archived'],
    default: 'new'
  },
  isUnread: {
    type: Boolean,
    default: true
  },
  // Préparation pour notif email (Phase 4 SendGrid)
  emailNotificationSent: {
    type: Boolean,
    default: false
  },
  // Note optionnelle du vendeur (pour son usage interne)
  vendorNote: {
    type: String,
    maxlength: 1000,
    default: ''
  },

  // Timestamps de transitions
  repliedAt: Date,
  archivedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes pour les queries fréquentes
quoteSchema.index({ vendor: 1, createdAt: -1 });
quoteSchema.index({ vendor: 1, status: 1, isUnread: 1 });
quoteSchema.index({ product: 1 });
quoteSchema.index({ 'requester.email': 1 });

// Méthodes statiques utiles
quoteSchema.statics.getUnreadCount = function (vendorId) {
  return this.countDocuments({ vendor: vendorId, isUnread: true });
};

quoteSchema.statics.getVendorStats = async function (vendorId) {
  const stats = await this.aggregate([
    { $match: { vendor: new mongoose.Types.ObjectId(vendorId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  const result = { new: 0, replied: 0, archived: 0, total: 0, unread: 0 };
  stats.forEach(s => { result[s._id] = s.count; result.total += s.count; });
  result.unread = await this.countDocuments({ vendor: vendorId, isUnread: true });
  return result;
};

module.exports = mongoose.model('Quote', quoteSchema);
