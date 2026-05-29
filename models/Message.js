const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:         { type: String, enum: ['text','image','offer','system'], default: 'text' },
  content:      { type: String, default: '' },      // texte
  imageUrl:     { type: String, default: '' },       // Cloudinary URL
  offer:        {                                    // offre intégrée
    price:    Number,
    status:   { type: String, enum: ['pending','accepted','declined'], default: 'pending' },
    offerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' }
  },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

messageSchema.index({ conversation: 1, createdAt: 1 });
module.exports = mongoose.model('Message', messageSchema);
