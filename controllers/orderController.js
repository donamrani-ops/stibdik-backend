const Order = require('../models/Order');
const Product = require('../models/Product');

// Create order
exports.createOrder = async (req, res, next) => {
  try {
    const { product, quantity, shippingAddress, paymentMethod } = req.body;

    const productDoc = await Product.findById(product);
    if (!productDoc) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    if (productDoc.type !== 'rfq' && productDoc.stock < quantity) {
      return res.status(400).json({ success: false, message: 'Stock insuffisant' });
    }

    const order = await Order.create({
      product,
      productSnapshot: {
        nameFr: productDoc.nameFr,
        nameAr: productDoc.nameAr,
        price: productDoc.price,
        image: productDoc.getMainImage()
      },
      buyer: req.user._id,
      buyerInfo: {
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone
      },
      vendor: productDoc.vendor,
      vendorInfo: {
        name: productDoc.vendorName
      },
      quantity,
      unitPrice: productDoc.price,
      totalAmount: productDoc.price * quantity,
      shippingAddress,
      paymentMethod
    });

    // Decrease stock
    if (productDoc.type === 'ecommerce') {
      productDoc.stock -= quantity;
      await productDoc.save();
    }

    res.status(201).json({ success: true, message: 'Commande créée', order });
  } catch (error) {
    next(error);
  }
};

// Get my orders (customer)
exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ buyer: req.user._id })
      .populate('product', 'nameFr images')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error) {
    next(error);
  }
};

// Get vendor orders
exports.getVendorOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ vendor: req.user._id })
      .populate('product', 'nameFr images')
      .populate('buyer', 'name email')
      .sort('-createdAt');

    res.status(200).json({ success: true, count: orders.length, orders });
  } catch (error) {
    next(error);
  }
};

// Get single order
exports.getOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('product')
      .populate('buyer', 'name email phone')
      .populate('vendor', 'name shopName');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }

    // Check access
    if (order.buyer._id.toString() !== req.user._id.toString() && 
        order.vendor._id.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    res.status(200).json({ success: true, order });
  } catch (error) {
    next(error);
  }
};

// Update order status
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status, trackingNumber, carrier } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }

    // Only vendor or admin can update
    if (order.vendor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }

    if (status === 'shipped' && trackingNumber) {
      await order.markAsShipped(trackingNumber, carrier);
    } else if (status === 'delivered') {
      await order.markAsDelivered();
    } else {
      order.status = status;
      await order.save();
    }

    res.status(200).json({ success: true, message: 'Statut mis à jour', order });
  } catch (error) {
    next(error);
  }
};

// Cancel order
exports.cancelOrder = async (req, res, next) => {
  try {
    const { reason } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }

    if (!order.isCancellable()) {
      return res.status(400).json({ success: false, message: 'Commande non annulable' });
    }

    await order.cancel(reason);

    res.status(200).json({ success: true, message: 'Commande annulée', order });
  } catch (error) {
    next(error);
  }
};

// Get global stats (admin)
exports.getGlobalStats = async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const stats = await Order.getGlobalReport(period);

    res.status(200).json({ success: true, stats });
  } catch (error) {
    next(error);
  }
};
