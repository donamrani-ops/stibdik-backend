// ═══════════════════════════════════════════════════════════
//  MODEL: REVIEW
//  Avis clients sur les produits
// ═══════════════════════════════════════════════════════════

const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  title: {
    type: String,
    trim: true,
    maxlength: 100,
  },
  comment: {
    type: String,
    required: [true, 'Le commentaire est requis'],
    trim: true,
    maxlength: 1000,
  },
  verifiedPurchase: {
    type: Boolean,
    default: false,
  },
  helpful: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved', // approved par défaut, modération optionnelle
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Index : un seul avis par user par produit
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });

// Mettre à jour la note moyenne du produit après chaque save/delete
reviewSchema.statics.updateProductRating = async function(productId) {
  const result = await this.aggregate([
    { $match: { product: productId, status: 'approved' } },
    { $group: { _id: '$product', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const Product = mongoose.model('Product');
  if (result.length > 0) {
    await Product.findByIdAndUpdate(productId, {
      rating: Math.round(result[0].avgRating * 10) / 10,
      reviews: result[0].count,
    });
  } else {
    await Product.findByIdAndUpdate(productId, { rating: 0, reviews: 0 });
  }
};

reviewSchema.post('save', function() {
  this.constructor.updateProductRating(this.product);
});

reviewSchema.post('deleteOne', { document: true }, function() {
  this.constructor.updateProductRating(this.product);
});

const Review = mongoose.model('Review', reviewSchema);
module.exports = Review;
