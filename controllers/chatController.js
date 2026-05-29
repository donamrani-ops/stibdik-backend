const Conversation = require('../models/Conversation');
const Message      = require('../models/Message');
const Product      = require('../models/Product');

// GET /api/chat/conversations — liste des conversations
exports.getConversations = async (req, res, next) => {
  try {
    const convs = await Conversation.find({ participants: req.user._id })
      .sort('-lastMessageAt')
      .populate('participants', 'name shopName avatar')
      .populate('product', 'nameFr nameAr images price')
      .lean();

    // Ajouter le nb de non-lus pour ce user
    const result = convs.map(c => ({
      ...c,
      unreadCount: c.unread?.[String(req.user._id)] || 0,
      otherUser: c.participants.find(p => String(p._id) !== String(req.user._id))
    }));
    res.json({ success: true, conversations: result });
  } catch (err) { next(err); }
};

// POST /api/chat/conversations — créer ou obtenir une conversation
exports.getOrCreateConversation = async (req, res, next) => {
  try {
    const { vendorId, productId } = req.body;
    if (!vendorId) return res.status(400).json({ success: false, message: 'vendorId requis' });
    if (String(vendorId) === String(req.user._id))
      return res.status(400).json({ success: false, message: 'Vous ne pouvez pas vous contacter vous-même' });

    let product = null;
    if (productId) product = await Product.findById(productId).lean();

    const conv = await Conversation.findOrCreate(req.user._id, vendorId, product);
    const populated = await Conversation.findById(conv._id)
      .populate('participants', 'name shopName')
      .populate('product', 'nameFr nameAr images price');

    res.json({ success: true, conversation: populated });
  } catch (err) { next(err); }
};

// GET /api/chat/conversations/:id/messages
exports.getMessages = async (req, res, next) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation non trouvée' });
    if (!conv.participants.map(String).includes(String(req.user._id)))
      return res.status(403).json({ success: false, message: 'Non autorisé' });

    const { before, limit = 30 } = req.query;
    const filter = { conversation: req.params.id };
    if (before) filter.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(filter)
      .sort('-createdAt').limit(Number(limit))
      .populate('sender', 'name shopName')
      .lean();

    // Marquer comme lus
    await Message.updateMany(
      { conversation: req.params.id, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
    // Reset unread counter
    await Conversation.findByIdAndUpdate(req.params.id, {
      $set: { [`unread.${req.user._id}`]: 0 }
    });

    res.json({ success: true, messages: messages.reverse() });
  } catch (err) { next(err); }
};

// POST /api/chat/conversations/:id/messages — envoyer un message
exports.sendMessage = async (req, res, next) => {
  try {
    const { content, type = 'text', imageUrl, offer } = req.body;
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation non trouvée' });
    if (!conv.participants.map(String).includes(String(req.user._id)))
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    if (!content && !imageUrl && type !== 'offer')
      return res.status(400).json({ success: false, message: 'Message vide' });

    const msg = await Message.create({
      conversation: req.params.id,
      sender:       req.user._id,
      type, content: content || '',
      imageUrl: imageUrl || '',
      offer: offer || undefined,
      readBy: [req.user._id]
    });

    // Mettre à jour la conversation
    const preview = type === 'image' ? '📷 Photo'
      : type === 'offer' ? `💰 Offre ${offer?.price} DH`
      : (content || '').slice(0, 80);

    const otherUsers = conv.participants.filter(p => String(p) !== String(req.user._id));
    const unreadUpdate = {};
    otherUsers.forEach(uid => { unreadUpdate[`unread.${uid}`] = (conv.unread?.get?.(String(uid)) || 0) + 1; });

    await Conversation.findByIdAndUpdate(req.params.id, {
      lastMessage:   preview,
      lastMessageAt: new Date(),
      lastMessageBy: req.user._id,
      $set: unreadUpdate
    });

    // Pusher — notification temps réel
    try {
      const pusher = require('../services/pusherService');
      const populated = await Message.findById(msg._id).populate('sender','name shopName').lean();
      pusher.trigger(`conversation-${req.params.id}`, 'new-message', populated);
      // Notifier chaque participant
      otherUsers.forEach(uid => {
        pusher.trigger(`user-${uid}`, 'new-message', {
          conversationId: req.params.id,
          preview,
          senderName: req.user.name
        });
      });
    } catch(e) { /* Pusher optionnel */ }

    const populated = await Message.findById(msg._id).populate('sender','name shopName').lean();
    res.status(201).json({ success: true, message: populated });
  } catch (err) { next(err); }
};

// PATCH /api/chat/conversations/:id/typing — typing indicator
exports.setTyping = async (req, res, next) => {
  try {
    const { isTyping } = req.body;
    try {
      const pusher = require('../services/pusherService');
      pusher.trigger(`conversation-${req.params.id}`, 'typing', {
        userId: String(req.user._id),
        userName: req.user.name,
        isTyping: !!isTyping
      });
    } catch(e) {}
    res.json({ success: true });
  } catch (err) { next(err); }
};

// GET /api/chat/unread — total non-lus
exports.getUnreadCount = async (req, res, next) => {
  try {
    const convs = await Conversation.find({ participants: req.user._id }).lean();
    const total = convs.reduce((sum, c) => sum + (c.unread?.[String(req.user._id)] || 0), 0);
    res.json({ success: true, unread: total });
  } catch (err) { next(err); }
};
