const Category = require('../models/Category');

// GET /api/categories — toutes les catégories avec enfants populés
exports.getAllCategories = async (req, res, next) => {
  try {
    const { tree, parent, level } = req.query;
    
    // Arbre complet
    if (tree === 'true') {
      const treeData = await Category.getTree();
      return res.json({ success: true, tree: treeData });
    }
    
    // Filtre par parent
    const filter = { active: true };
    if (parent === 'null' || parent === '0') {
      filter.parent = null; // catégories racines seulement
    } else if (parent) {
      filter.parent = parent;
    }
    if (level !== undefined) filter.level = parseInt(level);

    const categories = await Category.find(filter)
      .populate('children') // FIX : populer les sous-catégories
      .sort('order');

    res.json({ success: true, count: categories.length, categories });
  } catch (error) { next(error); }
};

// GET /api/categories/tree
exports.getCategoryTree = async (req, res, next) => {
  try {
    const tree = await Category.getTree();
    res.json({ success: true, tree });
  } catch (error) { next(error); }
};

// GET /api/categories/featured
exports.getFeatured = async (req, res, next) => {
  try {
    const categories = await Category.getFeatured(8);
    res.json({ success: true, categories });
  } catch (error) { next(error); }
};

// GET /api/categories/main — catégories racines avec leurs sous-catégories
exports.getMainCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({ parent: null, active: true })
      .populate({
        path: 'children',
        match: { active: true },
        options: { sort: { order: 1 } },
        select: 'name nameAr icon slug productCount'
      })
      .sort('order')
      .select('name nameAr icon slug productCount image');
    res.json({ success: true, categories });
  } catch (error) { next(error); }
};

// GET /api/categories/:slug — par slug avec ses enfants
exports.getCategoryBySlug = async (req, res, next) => {
  try {
    const category = await Category.findOne({ 
      slug: req.params.slug, 
      active: true 
    }).populate({
      path: 'children',
      match: { active: true },
      options: { sort: { order: 1 } },
      select: 'name nameAr icon slug productCount'
    });

    if (!category) {
      return res.status(404).json({ success: false, message: 'Catégorie non trouvée' });
    }

    // Breadcrumb
    const path = await category.getPath();

    res.json({ success: true, category, path });
  } catch (error) { next(error); }
};

// GET /api/categories/:id/children — sous-catégories directes
exports.getChildren = async (req, res, next) => {
  try {
    const children = await Category.find({
      parent: req.params.id,
      active: true
    }).sort('order').select('name nameAr icon slug productCount');
    res.json({ success: true, count: children.length, categories: children });
  } catch (error) { next(error); }
};

// POST /api/categories (Admin)
exports.createCategory = async (req, res, next) => {
  try {
    const category = await Category.create(req.body);
    res.status(201).json({ success: true, message: 'Catégorie créée', category });
  } catch (error) { next(error); }
};

// PUT /api/categories/:id (Admin)
exports.updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id, req.body,
      { new: true, runValidators: true }
    );
    if (!category) return res.status(404).json({ success: false, message: 'Catégorie non trouvée' });
    res.json({ success: true, message: 'Catégorie mise à jour', category });
  } catch (error) { next(error); }
};

// PATCH /api/categories/:id/order (Admin) — réorganiser
exports.updateOrder = async (req, res, next) => {
  try {
    const { order } = req.body;
    const category = await Category.findByIdAndUpdate(
      req.params.id, { order },
      { new: true }
    );
    if (!category) return res.status(404).json({ success: false, message: 'Catégorie non trouvée' });
    res.json({ success: true, category });
  } catch (error) { next(error); }
};

// PATCH /api/categories/:id/toggle (Admin) — activer/désactiver
exports.toggleActive = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Catégorie non trouvée' });
    category.active = !category.active;
    await category.save();
    res.json({ success: true, active: category.active });
  } catch (error) { next(error); }
};

// DELETE /api/categories/:id (Admin)
exports.deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Catégorie non trouvée' });

    // Vérifier s'il y a des enfants
    const childrenCount = await Category.countDocuments({ parent: req.params.id });
    if (childrenCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer : cette catégorie contient ${childrenCount} sous-catégorie(s). Supprimez-les d'abord.`
      });
    }

    await category.deleteOne();
    res.json({ success: true, message: 'Catégorie supprimée' });
  } catch (error) { next(error); }
};
