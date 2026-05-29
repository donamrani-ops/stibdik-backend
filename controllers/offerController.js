const Offer   = require('../models/Offer');
const Product = require('../models/Product');
const emailService = require('../services/emailService');

// POST /api/offers — créer une offre
exports.createOffer = async (req, res, next) => {
  try {
    const { productId, offerPrice, message } = req.body;
    if (!productId || !offerPrice) return res.status(400).json({ success:false, message:'productId et offerPrice requis' });

    const product = await Product.findById(productId).populate('vendor','name email shopName');
    if (!product) return res.status(404).json({ success:false, message:'Produit non trouvé' });
    if (product.type !== 'ecommerce') return res.status(400).json({ success:false, message:'Offres disponibles uniquement pour les produits ecommerce' });
    if (product.vendor._id.toString() === req.user._id.toString())
      return res.status(400).json({ success:false, message:'Vous ne pouvez pas faire une offre sur votre propre produit' });

    // Vérifier offre existante en cours
    const existing = await Offer.findOne({ product: productId, buyer: req.user._id, status: 'pending' });
    if (existing) return res.status(400).json({ success:false, message:'Vous avez déjà une offre en cours pour ce produit' });

    const mainImg = product.images?.find(i=>i.isMain) || product.images?.[0];
    const offer = await Offer.create({
      product:    productId,
      productSnapshot: { nameFr: product.nameFr, nameAr: product.nameAr, price: product.price, image: mainImg?.url||'' },
      vendor:     product.vendor._id,
      buyer:      req.user._id,
      buyerName:  req.user.name,
      buyerEmail: req.user.email,
      offerPrice: Number(offerPrice),
      message:    message||'',
      history:    [{ price: Number(offerPrice), message: message||'', by: 'buyer' }]
    });

    // Email + Pusher au vendeur
    try {
      await emailService.notifyVendorNewOffer(
        product.vendor.email, product.vendor.name||product.vendor.shopName,
        req.user.name, product.nameFr||product.nameAr, offerPrice, product.price, offer._id
      );
    } catch(e) { console.warn('Offer email failed:', e.message); }

    // Pusher — notif temps réel vendeur
    try {
      const pusher = require('../services/pusherService');
      pusher.trigger(`user-${product.vendor._id}`, 'offer-received', {
        type: 'offer_received',
        icon: '💰',
        title: `Offre de ${req.user.name}`,
        message: `${req.user.name} vous propose ${offerPrice} DH pour "${product.nameFr||product.nameAr}"`,
        offerId: offer._id,
        productId: product._id,
        productName: product.nameFr||product.nameAr,
        productImage: (product.images?.find(i=>i.isMain)||product.images?.[0])?.url||'',
        offerPrice,
        originalPrice: product.price,
      });
    } catch(e) { console.warn('Pusher offer-received failed:', e.message); }

    res.status(201).json({ success:true, message:'Offre envoyée !', offer });
  } catch(err) { next(err); }
};

// GET /api/offers/my — offres de l'acheteur
exports.getMyOffers = async (req, res, next) => {
  try {
    const offers = await Offer.find({ buyer: req.user._id })
      .sort('-createdAt').populate('product','nameFr nameAr images price').lean();
    res.json({ success:true, offers });
  } catch(err) { next(err); }
};

// GET /api/offers/received — offres reçues par le vendeur
exports.getReceivedOffers = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { vendor: req.user._id };
    if (status) filter.status = status;
    const offers = await Offer.find(filter)
      .sort('-createdAt').populate('product','nameFr nameAr images price').populate('buyer','name email').lean();
    const unread = await Offer.countDocuments({ vendor: req.user._id, isUnreadByVendor: true, status:'pending' });
    res.json({ success:true, offers, unread });
  } catch(err) { next(err); }
};

// PATCH /api/offers/:id/respond — vendeur répond
exports.respondToOffer = async (req, res, next) => {
  try {
    const { action, counterPrice, counterMessage } = req.body;
    // action: 'accept' | 'decline' | 'counter'
    const offer = await Offer.findById(req.params.id).populate('buyer','name email').populate('vendor','name email shopName');
    if (!offer) return res.status(404).json({ success:false, message:'Offre non trouvée' });
    if (offer.vendor._id.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return res.status(403).json({ success:false, message:'Non autorisé' });
    if (offer.status !== 'pending' && offer.status !== 'countered')
      return res.status(400).json({ success:false, message:`Offre déjà ${offer.status}` });
    if (offer.isExpired()) return res.status(400).json({ success:false, message:'Offre expirée' });

    if (action === 'accept') {
      offer.status = 'accepted';
      offer.isUnreadByBuyer = true;
      offer.history.push({ price: offer.counterPrice||offer.offerPrice, message:'Offre acceptée ✅', by:'vendor' });
    } else if (action === 'decline') {
      offer.status = 'declined';
      offer.isUnreadByBuyer = true;
      offer.history.push({ price: offer.offerPrice, message: counterMessage||'Offre refusée', by:'vendor' });
    } else if (action === 'counter') {
      if (!counterPrice) return res.status(400).json({ success:false, message:'counterPrice requis' });
      offer.status = 'countered';
      offer.counterPrice = Number(counterPrice);
      offer.counterMessage = counterMessage||'';
      offer.isUnreadByBuyer = true;
      offer.expiresAt = new Date(Date.now() + 24*60*60*1000); // 24h pour répondre
      offer.history.push({ price: Number(counterPrice), message: counterMessage||'', by:'vendor' });
    }
    offer.isUnreadByVendor = false;
    await offer.save();

    // Email + Pusher à l'acheteur
    try {
      await emailService.notifyBuyerOfferResponse(
        offer.buyer.email, offer.buyer.name,
        offer.productSnapshot?.nameFr||'Produit', action, counterPrice||offer.offerPrice, counterMessage
      );
    } catch(e) { console.warn('Offer response email failed:', e.message); }

    // Pusher — notif temps réel acheteur
    try {
      const pusher = require('../services/pusherService');
      const icons = { accept:'✅', decline:'❌', counter:'🔄' };
      const labels = { accept:'Offre acceptée !', decline:'Offre refusée', counter:'Contre-offre reçue' };
      pusher.trigger(`user-${offer.buyer._id}`, 'offer-response', {
        type: `offer_${action}`,
        icon: icons[action]||'💰',
        title: labels[action]||'Mise à jour offre',
        message: action==='accept'
          ? `Votre offre a été acceptée ! Finalisez l'achat.`
          : action==='counter'
          ? `Contre-offre : ${counterPrice} DH pour "${offer.productSnapshot?.nameFr||'Produit'}"`
          : `Votre offre pour "${offer.productSnapshot?.nameFr||'Produit'}" a été refusée.`,
        offerId: offer._id,
        productName: offer.productSnapshot?.nameFr||'Produit',
        productImage: offer.productSnapshot?.image||'',
        action,
        price: counterPrice||offer.offerPrice,
      });
    } catch(e) { console.warn('Pusher offer-response failed:', e.message); }

    res.json({ success:true, message:'Réponse envoyée', offer });
  } catch(err) { next(err); }
};

// PATCH /api/offers/:id/accept-counter — acheteur accepte la contre-offre
exports.acceptCounter = async (req, res, next) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ success:false, message:'Offre non trouvée' });
    if (offer.buyer.toString() !== req.user._id.toString()) return res.status(403).json({ success:false, message:'Non autorisé' });
    if (offer.status !== 'countered') return res.status(400).json({ success:false, message:'Pas de contre-offre à accepter' });
    offer.status = 'accepted';
    offer.offerPrice = offer.counterPrice;
    offer.isUnreadByVendor = true;
    offer.history.push({ price: offer.counterPrice, message:'Contre-offre acceptée ✅', by:'buyer' });
    await offer.save();
    res.json({ success:true, message:'Contre-offre acceptée !', offer });
  } catch(err) { next(err); }
};

// PATCH /api/offers/:id/withdraw — acheteur retire son offre
exports.withdrawOffer = async (req, res, next) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ success:false, message:'Offre non trouvée' });
    if (offer.buyer.toString() !== req.user._id.toString()) return res.status(403).json({ success:false, message:'Non autorisé' });
    if (!['pending','countered'].includes(offer.status)) return res.status(400).json({ success:false, message:'Impossible de retirer cette offre' });
    offer.status = 'withdrawn';
    await offer.save();
    res.json({ success:true, message:'Offre retirée' });
  } catch(err) { next(err); }
};

// GET /api/offers/stats — stats vendeur
exports.getOfferStats = async (req, res, next) => {
  try {
    const [pending, accepted, countered] = await Promise.all([
      Offer.countDocuments({ vendor: req.user._id, status:'pending' }),
      Offer.countDocuments({ vendor: req.user._id, status:'accepted' }),
      Offer.countDocuments({ vendor: req.user._id, status:'countered' }),
    ]);
    res.json({ success:true, stats:{ pending, accepted, countered, total:pending+accepted+countered } });
  } catch(err) { next(err); }
};
