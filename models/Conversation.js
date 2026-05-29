const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  product:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productSnapshot: { nameFr: String, nameAr: String, image: String, price: Number },
  lastMessage:  { type: String, default: '' },
  lastMessageAt:{ type: Date, default: Date.now },
  lastMessageBy:{ type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  unread: {                          // compteurs non-lus par user
    type: Map,
    of: Number,
    default: {}
  },
  typingUsers: [String],             // userIds en train de taper (non persisté)
}, { timestamps: true });

conversationSchema.index({ participants: 1, lastMessageAt: -1 });
conversationSchema.index({ product: 1, participants: 1 }, { unique: true, sparse: true });

// Trouver ou créer une conversation entre 2 users pour un produit
conversationSchema.statics.findOrCreate = async function(user1Id, user2Id, product) {
  const ids = [user1Id, user2Id].map(String).sort();
  let conv = await this.findOne({
    'participants': { $all: ids },
    product: product?._id || null
  });
  if (!conv) {
    const mainImg = product?.images?.find(i=>i.isMain) || product?.images?.[0];
    conv = await this.create({
      participants: ids,
      product: product?._id || null,
      productSnapshot: product ? {
        nameFr: product.nameFr, nameAr: product.nameAr,
        image: mainImg?.url || '', price: product.price
      } : null
    });
  }
  return conv;
};
module.exports = mongoose.model('Conversation', conversationSchema);
