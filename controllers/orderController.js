const Order   = require('../models/Order');
const Product = require('../models/Product');

// Create order
exports.createOrder = async (req, res, next) => {
  try {
    const { product, quantity, shippingAddress, buyerInfo, paymentMethod } = req.body;

    const productDoc = await Product.findById(product);
    if (!productDoc) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    if (productDoc.type !== 'rfq' && productDoc.stock < quantity) {
      return res.status(400).json({ success: false, message: 'Stock insuffisant' });
    }

    // ── Image principale — extraire l'URL (getMainImage retourne un objet) ──
    const mainImgObj = productDoc.getMainImage ? productDoc.getMainImage() : null;
    const mainImgUrl = typeof mainImgObj === 'string'
      ? mainImgObj
      : (mainImgObj?.url || productDoc.images?.[0]?.url || '');

    // ── buyerInfo — priorité au formulaire, fallback sur le compte user ──
    const resolvedPhone = buyerInfo?.phone || shippingAddress?.phone || req.user.phone || '';
    const resolvedName  = buyerInfo?.name  || shippingAddress?.fullName || req.user.name || '';
    const resolvedCity  = buyerInfo?.city  || shippingAddress?.city || '';
    const resolvedAddr  = buyerInfo?.address || shippingAddress?.address || '';

    if (!resolvedPhone) {
      return res.status(400).json({ success: false, message: 'Numéro de téléphone requis pour la livraison' });
    }

    // Appliquer le crédit Stibdik de l'acheteur (parrainage), si demandé
    const User = require('../models/User');
    const buyerUser = await User.findById(req.user._id);
    const baseTotal = productDoc.price * quantity;
    let creditApplied = 0;
    if (req.body.useCredit && buyerUser && (buyerUser.boostCredit || 0) > 0) {
      creditApplied = Math.min(buyerUser.boostCredit, baseTotal);
      buyerUser.boostCredit = buyerUser.boostCredit - creditApplied;
      await buyerUser.save({ validateBeforeSave: false });
    }
    const finalTotal = Math.max(0, baseTotal - creditApplied);

    const order = await Order.create({
      product,
      productSnapshot: {
        nameFr: productDoc.nameFr,
        nameAr: productDoc.nameAr,
        price:  productDoc.price,
        image:  mainImgUrl
      },
      buyer: req.user._id,
      buyerInfo: {
        name:  resolvedName,
        email: req.user.email || '',
        phone: resolvedPhone
      },
      vendor: productDoc.vendor,
      vendorInfo: {
        name:     productDoc.vendorName,
        shopName: productDoc.vendorName
      },
      quantity,
      unitPrice:   productDoc.price,
      totalAmount: finalTotal,
      creditApplied,
      shippingAddress: shippingAddress || {
        fullName: resolvedName,
        phone:    resolvedPhone,
        address:  resolvedAddr,
        city:     resolvedCity,
      },
      paymentMethod
    });

    // Décrémenter le stock
    if (productDoc.type !== 'rfq') {
      productDoc.stock = Math.max(0, productDoc.stock - quantity);
      await productDoc.save();
    }

    // Notification push au vendeur (nouvelle vente)
    try {
      const pushService = require('../services/pushService');
      pushService.sendToUser(productDoc.vendor, {
        title: '🎉 Nouvelle vente !',
        body: `${productDoc.name || 'Votre article'} a ete commande (${quantity}x)`,
        url: '/?page=orders',
        tag: `order-${order._id}`,
      }, 'sale').catch(() => {});
    } catch(e) { /* Push optionnel */ }

    res.status(201).json({ success: true, message: 'Commande créée', order });
  } catch (error) { next(error); }
};

// Get my orders (buyer)
exports.getMyOrders = async (req, res, next) => {
  try {
    // Auto-confirmation : les commandes expédiées depuis +7 jours passent en 'delivered'
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
    await Order.updateMany(
      { buyer: req.user._id, status: 'shipped', shippedAt: { $lte: cutoff } },
      {
        $set: { status: 'delivered', deliveredAt: new Date(), autoConfirmed: true },
        $push: { statusHistory: { status: 'delivered', timestamp: new Date(), note: 'Réception confirmée automatiquement (7 jours)' } }
      }
    );

    const orders = await Order.find({ buyer: req.user._id })
      .sort('-createdAt')
      .populate('product', 'nameFr nameAr images')
      .populate('vendor',  'name shopName')
      .lean();
    res.status(200).json({ success: true, orders });
  } catch (error) { next(error); }
};

// Get vendor orders
exports.getVendorOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ vendor: req.user._id })
      .sort('-createdAt')
      .populate('product', 'nameFr nameAr images')
      .populate('buyer',   'name email phone')
      .lean();
    res.status(200).json({ success: true, orders });
  } catch (error) { next(error); }
};

// Get all orders (admin)
exports.getAllOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = status ? { status } : {};
    const skip   = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find(filter).sort('-createdAt').skip(skip).limit(Number(limit))
        .populate('product', 'nameFr images')
        .populate('buyer',   'name email')
        .populate('vendor',  'name shopName')
        .lean(),
      Order.countDocuments(filter)
    ]);
    res.status(200).json({ success: true, orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) { next(error); }
};

// Update order status
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Commande non trouvée' });

    const isVendor = order.vendor.toString() === req.user._id.toString();
    const isAdmin  = req.user.role === 'admin';
    const isBuyer  = order.buyer.toString() === req.user._id.toString();

    // Règles de transition selon le rôle (modèle hybride) :
    // - L'ACHETEUR ne peut que confirmer la réception : shipped -> delivered
    // - Le VENDEUR gère le flux jusqu'à l'expédition (pas delivered lui-même)
    // - L'ADMIN peut tout faire (arbitrage litiges)
    if (isAdmin) {
      // autorisé pour tout
    } else if (isBuyer && !isVendor) {
      // L'acheteur ne peut QUE confirmer la réception d'une commande expédiée
      if (!(order.status === 'shipped' && status === 'delivered')) {
        return res.status(403).json({
          success: false,
          message: "Vous ne pouvez que confirmer la réception d'une commande expédiée"
        });
      }
    } else if (isVendor) {
      // Le vendeur gère le flux mais ne peut pas marquer 'delivered' lui-même
      // (c'est à l'acheteur de confirmer, ou auto-confirmation après 7 jours)
      if (status === 'delivered') {
        return res.status(403).json({
          success: false,
          message: "La réception doit être confirmée par l'acheteur"
        });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }

    // Enregistrer les dates clés
    if (status === 'shipped' && order.status !== 'shipped') {
      order.shippedAt = new Date();
    }
    if (status === 'delivered' && order.status !== 'delivered') {
      order.deliveredAt = new Date();
    }

    // Historique
    order.statusHistory.push({
      status,
      timestamp: new Date(),
      note: isBuyer ? 'Réception confirmée par le client' : (isAdmin ? 'Mis à jour par admin' : 'Mis à jour par le vendeur'),
      updatedBy: req.user._id,
    });

    order.status = status;
    await order.save();
    res.status(200).json({ success: true, message: 'Statut mis à jour', order });
  } catch (error) { next(error); }
};

// Get single order
exports.getOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('product', 'nameFr nameAr images price')
      .populate('buyer',   'name email phone')
      .populate('vendor',  'name shopName phone')
      .lean();
    if (!order) return res.status(404).json({ success: false, message: 'Commande non trouvée' });

    // Vérifier les droits d'accès
    const isBuyer  = order.buyer?._id?.toString() === req.user._id.toString();
    const isVendor = order.vendor?._id?.toString() === req.user._id.toString();
    const isAdmin  = req.user.role === 'admin';
    if (!isBuyer && !isVendor && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }

    res.status(200).json({ success: true, order });
  } catch (error) { next(error); }
};

// Global stats (admin)
exports.getGlobalStats = async (req, res, next) => {
  try {
    const { period = 'month' } = req.params;
    const now   = new Date();
    const start = new Date();
    if (period === 'week')  start.setDate(now.getDate() - 7);
    if (period === 'month') start.setMonth(now.getMonth() - 1);
    if (period === 'year')  start.setFullYear(now.getFullYear() - 1);

    const orders = await Order.find({ createdAt: { $gte: start } }).lean();
    const totalOrders      = orders.length;
    const totalRevenue     = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const totalPlatformFees = totalRevenue * 0.05;

    res.status(200).json({ success: true, stats: { totalOrders, totalRevenue, totalPlatformFees, period } });
  } catch (error) { next(error); }
};

// Cancel order (buyer)
exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    const isBuyer = order.buyer.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isBuyer && !isAdmin) return res.status(403).json({ success: false, message: 'Non autorisé' });
    if (['delivered','completed','cancelled'].includes(order.status))
      return res.status(400).json({ success: false, message: 'Impossible d\'annuler cette commande' });
    order.status = 'cancelled';
    await order.save();
    res.status(200).json({ success: true, message: 'Commande annulée', order });
  } catch (error) { next(error); }
};

// Confirm delivery (buyer)
exports.confirmDelivery = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    if (order.buyer.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    order.status = 'delivered';
    await order.save();
    res.status(200).json({ success: true, message: 'Livraison confirmée', order });
  } catch (error) { next(error); }
};

// Get vendor stats
exports.getVendorStats = async (req, res, next) => {
  try {
    const orders = await Order.find({ vendor: req.user._id }).lean();
    const totalRevenue = orders.filter(o => ['delivered','completed'].includes(o.status))
      .reduce((s, o) => s + (o.totalAmount || 0), 0);
    res.status(200).json({ success: true, stats: {
      totalOrders: orders.length,
      totalRevenue,
      pending: orders.filter(o => o.status === 'pending').length,
      delivered: orders.filter(o => ['delivered','completed'].includes(o.status)).length,
    }});
  } catch (error) { next(error); }
};
