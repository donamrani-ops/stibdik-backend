const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productSnapshot: {
    nameFr: String,
    nameAr: String,
    price: Number,
    image: String
  },
  
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  buyerInfo: {
    name: { type: String, required: true },
    email: String,
    phone: { type: String, required: true }
  },
  
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vendorInfo: {
    name: String,
    shopName: String
  },
  
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  shippingAddress: {
    fullName: { type: String, required: true },
    phone:    { type: String, required: true },
    address:  { type: String, required: true },
    city:     { type: String, required: true },
    postalCode: String
  },
  shippingCost: {
    type: Number,
    default: 0,
    min: 0
  },
  
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
    default: 'pending'
  },
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    note: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  paymentMethod: {
    type: String,
    enum: ['cod', 'card', 'transfer'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentDetails: {
    transactionId: String,
    paidAt: Date,
    refundedAt: Date,
    refundReason: String
  },
  
  estimatedDelivery: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  cancellationReason: String,
  notes: String,
  internalNotes: String,
  trackingNumber: String,
  carrier: String,
  
  platformFee: {
    type: Number,
    default: 0
  },
  platformFeePercent: {
    type: Number,
    default: 5
  },

  reviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review',
    default: null
  },

  // ── Coupon appliqué ─────────────────────────────────────
  coupon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    default: null
  },
  couponCode:     { type: String, default: null },
  discountAmount: { type: Number, default: 0 }

}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true }
});

// ── Indexes ──────────────────────────────────────────────
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ buyer: 1, createdAt: -1 });
orderSchema.index({ vendor: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });

// ── Pre-save hooks ───────────────────────────────────────
orderSchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await this.constructor.countDocuments();
    this.orderNumber = `CMD-${Date.now().toString().slice(-8)}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

orderSchema.pre('save', function(next) {
  if (this.isModified('totalAmount') || this.isModified('platformFeePercent')) {
    this.platformFee = (this.totalAmount * this.platformFeePercent) / 100;
  }
  next();
});

orderSchema.pre('save', function(next) {
  if (this.isModified('status') && !this.isNew) {
    this.statusHistory.push({ status: this.status, timestamp: new Date() });
  }
  next();
});

orderSchema.post('save', async function(doc) {
  if (doc.isNew) {
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(doc.vendor, {
      $inc: { 'stats.totalOrders': 1, 'stats.totalRevenue': doc.totalAmount - doc.platformFee }
    });
  }
});

// ── Méthodes d'instance ──────────────────────────────────
orderSchema.methods.confirm = async function() {
  this.status = 'confirmed';
  this.statusHistory.push({ status: 'confirmed', timestamp: new Date(), note: 'Commande confirmée par le vendeur' });
  await this.save();
};

orderSchema.methods.markAsShipped = async function(trackingNumber, carrier) {
  this.status = 'shipped';
  this.trackingNumber = trackingNumber;
  this.carrier = carrier;
  this.statusHistory.push({ status: 'shipped', timestamp: new Date(), note: `Expédiée via ${carrier}` });
  await this.save();
};

orderSchema.methods.markAsDelivered = async function() {
  this.status = 'delivered';
  this.deliveredAt = new Date();
  this.paymentStatus = 'paid';
  this.paymentDetails.paidAt = new Date();
  this.statusHistory.push({ status: 'delivered', timestamp: new Date(), note: 'Commande livrée avec succès' });
  await this.save();
};

orderSchema.methods.cancel = async function(reason) {
  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancellationReason = reason;
  this.statusHistory.push({ status: 'cancelled', timestamp: new Date(), note: reason });
  await this.save();
};

orderSchema.methods.getVendorAmount = function() { return this.totalAmount - this.platformFee; };
orderSchema.methods.isEditable     = function() { return ['pending', 'confirmed'].includes(this.status); };
orderSchema.methods.isCancellable  = function() { return ['pending', 'confirmed', 'processing'].includes(this.status); };

// ── Méthodes statiques ───────────────────────────────────
orderSchema.statics.getVendorStats = async function(vendorId, startDate, endDate) {
  const match = { vendor: vendorId };
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate)   match.createdAt.$lte = new Date(endDate);
  }
  return this.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 }, totalRevenue: { $sum: { $subtract: ['$totalAmount', '$platformFee'] } } } }
  ]);
};

orderSchema.statics.getRecent = function(limit = 10) {
  return this.find()
    .populate('buyer',   'name email')
    .populate('vendor',  'name shopName')
    .populate('product', 'nameFr images')
    .sort('-createdAt').limit(limit);
};

orderSchema.statics.getGlobalReport = async function(period = 'month') {
  const date = new Date();
  let startDate;
  switch(period) {
    case 'day':   startDate = new Date(date.setHours(0,0,0,0)); break;
    case 'week':  startDate = new Date(date.setDate(date.getDate()-7)); break;
    case 'month': startDate = new Date(date.setMonth(date.getMonth()-1)); break;
    case 'year':  startDate = new Date(date.setFullYear(date.getFullYear()-1)); break;
    default:      startDate = new Date(0);
  }
  const report = await this.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    { $group: { _id: null, totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$totalAmount' }, totalPlatformFees: { $sum: '$platformFee' }, averageOrderValue: { $avg: '$totalAmount' }, byStatus: { $push: { status: '$status', amount: '$totalAmount' } } } }
  ]);
  return report[0] || { totalOrders: 0, totalRevenue: 0, totalPlatformFees: 0, averageOrderValue: 0 };
};

module.exports = mongoose.model('Order', orderSchema);
