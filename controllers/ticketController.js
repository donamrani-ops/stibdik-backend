const emailService = require('../services/emailService');
const Ticket = require('../models/Ticket');
const AuditLog = require('../models/AuditLog');

// ── USER ────────────────────────────────────────────────────────────────────

// POST /api/tickets — créer un ticket
exports.createTicket = async (req, res, next) => {
  try {
    const { subject, category, content } = req.body;
    if (!subject?.trim() || !category || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'Sujet, catégorie et message requis' });
    }
    const ticket = await Ticket.create({
      user:      req.user._id,
      userName:  req.user.name,
      userEmail: req.user.email,
      subject:   subject.trim(),
      category,
      messages: [{
        author:     req.user._id,
        authorName: req.user.name,
        role:       'user',
        content:    content.trim()
      }],
      lastReplyAt: new Date(),
      lastReplyBy: 'user'
    });
    // Notifications email
    emailService.notifyAdminNewTicket(ticket).catch(() => {});
    emailService.confirmTicketCreated(ticket).catch(() => {});

    res.status(201).json({ success: true, ticket });
  } catch (err) { next(err); }
};

// GET /api/tickets — mes tickets
exports.getMyTickets = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const filter = { user: req.user._id };
    if (status) filter.status = status;
    const [tickets, total] = await Promise.all([
      Ticket.find(filter).sort('-createdAt').limit(limit * 1).skip((page - 1) * limit).select('-messages'),
      Ticket.countDocuments(filter)
    ]);
    res.json({ success: true, tickets, total, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

// GET /api/tickets/:id — détail d'un ticket
exports.getTicket = async (req, res, next) => {
  try {
    const ticket = await Ticket.findOne({ _id: req.params.id, user: req.user._id })
      .populate('messages.author', 'name role');
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket introuvable' });
    res.json({ success: true, ticket });
  } catch (err) { next(err); }
};

// POST /api/tickets/:id/reply — répondre à un ticket
exports.replyTicket = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, message: 'Message requis' });
    const ticket = await Ticket.findOne({ _id: req.params.id, user: req.user._id });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket introuvable' });
    if (ticket.status === 'closed') return res.status(400).json({ success: false, message: 'Ce ticket est fermé' });
    ticket.messages.push({ author: req.user._id, authorName: req.user.name, role: 'user', content: content.trim() });
    ticket.status = 'open';
    ticket.lastReplyAt = new Date();
    ticket.lastReplyBy = 'user';
    await ticket.save();

    // Notifier admin
    emailService.notifyAdminTicketReply(ticket, content.trim()).catch(() => {});

    res.json({ success: true, ticket });
  } catch (err) { next(err); }
};

// PATCH /api/tickets/:id/close — fermer un ticket
exports.closeTicket = async (req, res, next) => {
  try {
    const ticket = await Ticket.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { status: 'closed', resolvedAt: new Date() },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket introuvable' });
    res.json({ success: true, ticket });
  } catch (err) { next(err); }
};

// ── ADMIN ────────────────────────────────────────────────────────────────────

// GET /api/tickets/admin — tous les tickets
exports.adminGetTickets = async (req, res, next) => {
  try {
    const { status, category, priority, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status)   filter.status   = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    const [tickets, total] = await Promise.all([
      Ticket.find(filter).sort('-createdAt').limit(limit * 1).skip((page - 1) * limit)
        .populate('user', 'name email').select('-messages'),
      Ticket.countDocuments(filter)
    ]);
    res.json({ success: true, tickets, total, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

// GET /api/tickets/admin/:id — détail admin
exports.adminGetTicket = async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('user', 'name email role')
      .populate('messages.author', 'name role');
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket introuvable' });
    res.json({ success: true, ticket });
  } catch (err) { next(err); }
};

// POST /api/tickets/admin/:id/reply — répondre (admin)
exports.adminReply = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, message: 'Message requis' });
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket introuvable' });
    ticket.messages.push({ author: req.user._id, authorName: req.user.name, role: 'admin', content: content.trim() });
    ticket.status = 'in_progress';
    ticket.lastReplyAt = new Date();
    ticket.lastReplyBy = 'admin';
    ticket.assignedTo = req.user._id;
    await ticket.save();
    res.json({ success: true, ticket });
  } catch (err) { next(err); }
};

// PATCH /api/tickets/admin/:id/status — changer statut
exports.adminUpdateStatus = async (req, res, next) => {
  try {
    const { status, priority } = req.body;
    const update = {};
    if (status)   { update.status = status; if (status === 'resolved') update.resolvedAt = new Date(); }
    if (priority) update.priority = priority;
    const ticket = await Ticket.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket introuvable' });
    res.json({ success: true, ticket });
  } catch (err) { next(err); }
};

// GET /api/tickets/admin/stats — statistiques
exports.adminStats = async (req, res, next) => {
  try {
    const [open, in_progress, resolved, closed, total] = await Promise.all([
      Ticket.countDocuments({ status: 'open' }),
      Ticket.countDocuments({ status: 'in_progress' }),
      Ticket.countDocuments({ status: 'resolved' }),
      Ticket.countDocuments({ status: 'closed' }),
      Ticket.countDocuments()
    ]);
    res.json({ success: true, stats: { open, in_progress, resolved, closed, total } });
  } catch (err) { next(err); }
};
