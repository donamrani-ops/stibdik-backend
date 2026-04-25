const Category = require('../models/Category');

// Get all categories
exports.getAllCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({ active: true }).sort('order');
    res.status(200).json({ success: true, count: categories.length, categories });
  } catch (error) {
    next(error);
  }
};

// Get category tree
exports.getCategoryTree = async (req, res, next) => {
  try {
    const tree = await Category.getTree();
    res.status(200).json({ success: true, tree });
  } catch (error) {
    next(error);
  }
};

// Get featured categories
exports.getFeatured = async (req, res, next) => {
  try {
    const categories = await Category.getFeatured(8);
    res.status(200).json({ success: true, categories });
  } catch (error) {
    next(error);
  }
};

// Get category by slug
exports.getCategoryBySlug = async (req, res, next) => {
  try {
    const category = await Category.findBySlug(req.params.slug);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Catégorie non trouvée' });
    }
    res.status(200).json({ success: true, category });
  } catch (error) {
    next(error);
  }
};

// Create category (Admin)
exports.createCategory = async (req, res, next) => {
  try {
    const category = await Category.create(req.body);
    res.status(201).json({ success: true, message: 'Catégorie créée', category });
  } catch (error) {
    next(error);
  }
};

// Update category (Admin)
exports.updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { 
      new: true, 
      runValidators: true 
    });

    if (!category) {
      return res.status(404).json({ success: false, message: 'Catégorie non trouvée' });
    }

    res.status(200).json({ success: true, message: 'Catégorie mise à jour', category });
  } catch (error) {
    next(error);
  }
};

// Delete category (Admin)
exports.deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ success: false, message: 'Catégorie non trouvée' });
    }

    await category.deleteOne();

    res.status(200).json({ success: true, message: 'Catégorie supprimée' });
  } catch (error) {
    next(error);
  }
};
