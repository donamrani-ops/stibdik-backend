const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName:{ type: String },
  role:      { type: String, enum: ['user','admin','system'], default: 'user' },
  content:   { type: String, required: true, trim: true, maxlength: 2000 },
  attachments:[{ url: String, publicId: String }],
}, { timestamps: true });

const ticketSchema = new mongoose.Schema({
  number:   { type: Number, unique: true },
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String },
  userEmail:{ type: String },

  category: {
    type: String,
    enum: ['order','payment','account','product','vendor','delivery','refund','abuse','other'],
    required: true
  },
  subject:  { type: String, required: true, trim: true, maxlength: 200 },
  status:   { type: String, enum: ['open','in_progress','resolved','closed'], default: 'open' },
  priority: { type: String, enum: ['low','normal','high','urgent'], default: 'normal' },

  messages: [messageSchema],

  assignedTo:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt:  { type: Date },
  lastReplyAt: { type: Date },
  lastReplyBy: { type: String, enum: ['user','admin'], default: 'user' },

}, { timestamps: true });

// Auto-incrémenter le numéro de ticket
ticketSchema.pre('save', async function(next) {
  if (this.isNew) {
    const last = await this.constructor.findOne({}, {}, { sort: { number: -1 } });
    this.number = (last?.number || 1000) + 1;
  }
  next();
});

ticketSchema.index({ user: 1, status: 1 });
ticketSchema.index({ status: 1, createdAt: -1 });
ticketSchema.index({ number: 1 });

module.exports = mongoose.model('Ticket', ticketSchema);
