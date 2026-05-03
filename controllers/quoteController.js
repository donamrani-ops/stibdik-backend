// Controller: Quotes (RFQ)
const Quote = require('../models/Quote');
const Product = require('../models/Product');

// @desc    Créer une demande de devis
// @route   POST /api/quotes
// @access  Public (mais on enregistre userId si connecté)
exports.createQuote = async (req, res, next) => {
  try {
    const { product, name, email, phone, quantity, message } = req.body;

    // Validation rapide
    if (!product || !name || !email || !quantity || !message) {
      return res.status(400).json({
        success: false,
        message: 'Champs obligatoires manquants : product, name, email, quantity, message'
      });
    }

    // Récupérer le produit pour vérifier qu'il existe et qu'il est de type rfq
    const productDoc = await Product.findById(product);
    if (!productDoc) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    // On accepte aussi les autres types par souplesse, mais on log
    if (productDoc.type !== 'rfq') {
      console.warn(`Quote créée pour un produit non-rfq (type=${productDoc.type}, id=${product})`);
    }

    // Snapshot
    const snapshot = {
      nameFr: productDoc.nameFr,
      nameAr: productDoc.nameAr,
      image: productDoc.images?.[0]?.url || null,
      type: productDoc.type
    };

    const quote = await Quote.create({
      product,
      productSnapshot: snapshot,
      vendor: productDoc.vendor,
      requester: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone ? phone.trim() : '',
        userId: req.user ? req.user._id : null
      },
      quantity: parseInt(quantity, 10),
      message: message.trim(),
      status: 'new',
      isUnread: true
    });

    res.status(201).json({
      success: true,
      message: 'Demande de devis envoyée',
      quote: {
        _id: quote._id,
        createdAt: quote.createdAt
        // On ne renvoie PAS le contenu complet au demandeur (privacy)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Lister les quotes reçues par le vendeur connecté
// @route   GET /api/quotes/received
// @access  Vendor / Admin
exports.getReceivedQuotes = async (req, res, next) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    const filter = { vendor: req.user._id };
    if (status && ['new', 'replied', 'archived'].includes(status)) {
      filter.status = status;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [quotes, total] = await Promise.all([
      Quote.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .populate('product', 'nameFr nameAr type slug'),
      Quote.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      count: quotes.length,
      quotes
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Stats quotes du vendor (pour badge dashboard)
// @route   GET /api/quotes/stats
// @access  Vendor / Admin
exports.getVendorQuoteStats = async (req, res, next) => {
  try {
    const stats = await Quote.getVendorStats(req.user._id);
    res.status(200).json({ success: true, stats });
  } catch (error) {
    next(error);
  }
};

// @desc    Récupérer une quote précise (vendor uniquement)
// @route   GET /api/quotes/:id
// @access  Vendor (propriétaire) / Admin
exports.getQuote = async (req, res, next) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('product', 'nameFr nameAr images type slug')
      .populate('vendor', 'name shopName');

    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }

    // Seul le vendor destinataire ou un admin peut lire
    if (quote.vendor._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }

    // Marquer comme lu automatiquement à la consultation
    if (quote.isUnread) {
      quote.isUnread = false;
      await quote.save();
    }

    res.status(200).json({ success: true, quote });
  } catch (error) {
    next(error);
  }
};

// @desc    Marquer comme lu/non-lu
// @route   PATCH /api/quotes/:id/read
// @access  Vendor (propriétaire) / Admin
exports.markRead = async (req, res, next) => {
  try {
    const { isUnread = false } = req.body;
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }
    if (quote.vendor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }
    quote.isUnread = !!isUnread;
    await quote.save();
    res.status(200).json({ success: true, quote });
  } catch (error) {
    next(error);
  }
};

// @desc    Changer le statut (new -> replied / archived)
// @route   PATCH /api/quotes/:id/status
// @access  Vendor (propriétaire) / Admin
exports.updateStatus = async (req, res, next) => {
  try {
    const { status, vendorNote } = req.body;
    if (!['new', 'replied', 'archived'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Statut invalide' });
    }
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }
    if (quote.vendor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }
    quote.status = status;
    quote.isUnread = false;
    if (status === 'replied') quote.repliedAt = new Date();
    if (status === 'archived') quote.archivedAt = new Date();
    if (typeof vendorNote === 'string') quote.vendorNote = vendorNote.slice(0, 1000);
    await quote.save();
    res.status(200).json({ success: true, quote });
  } catch (error) {
    next(error);
  }
};

// @desc    Supprimer une quote
// @route   DELETE /api/quotes/:id
// @access  Vendor (propriétaire) / Admin
exports.deleteQuote = async (req, res, next) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: 'Demande non trouvée' });
    }
    if (quote.vendor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }
    await quote.deleteOne();
    res.status(200).json({ success: true, message: 'Demande supprimée' });
  } catch (error) {
    next(error);
  }
};
