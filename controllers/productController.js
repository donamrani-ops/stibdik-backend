const Product = require('../models/Product');
const Category = require('../models/Category');

// Get all products with filters
exports.getAllProducts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, city, minPrice, maxPrice, type, sort = '-createdAt' } = req.query;
    
    const products = await Product.advancedSearch({
      category, city, minPrice, maxPrice, type, sort, page, limit
    });

    const total = await Product.countDocuments({ status: 'active' });

    res.status(200).json({
      success: true,
      count: products.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      products
    });
  } catch (error) {
    next(error);
  }
};

// Get single product
exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('vendor', 'name shopName shopLogo')
      .populate('category', 'name nameAr icon');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    res.status(200).json({ success: true, product });
  } catch (error) {
    next(error);
  }
};

// Create product (Vendor/Admin)
exports.createProduct = async (req, res, next) => {
  try {
    req.body.vendor = req.user._id;
    req.body.vendorName = req.user.shopName || req.user.name;

    const product = await Product.create(req.body);

    res.status(201).json({ success: true, message: 'Produit créé', product });
  } catch (error) {
    next(error);
  }
};

// Update product
exports.updateProduct = async (req, res, next) => {
  try {
    let product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    // Check ownership
    if (product.vendor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }

    product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

    res.status(200).json({ success: true, message: 'Produit mis à jour', product });
  } catch (error) {
    next(error);
  }
};

// Delete product
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    if (product.vendor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Non autorisé' });
    }

    await product.deleteOne();

    res.status(200).json({ success: true, message: 'Produit supprimé' });
  } catch (error) {
    next(error);
  }
};

// Increment views
exports.incrementViews = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (product) {
      await product.incrementViews();
    }
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

// Get similar products
exports.getSimilarProducts = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Produit non trouvé' });
    }

    const similar = await Product.findSimilar(product._id, product.category, 6);

    res.status(200).json({ success: true, products: similar });
  } catch (error) {
    next(error);
  }
};

// Get trending products
exports.getTrending = async (req, res, next) => {
  try {
    const products = await Product.getTrending(10);
    res.status(200).json({ success: true, products });
  } catch (error) {
    next(error);
  }
};
