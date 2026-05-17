// Controller: Collections
// Collections sont stockées dans User.collections (sous-document)
const User = require('../models/User');
const mongoose = require('mongoose');

const isValidId = id => mongoose.Types.ObjectId.isValid(id);

// ─── GET /api/collections ─────────────────────────────────────────────────────
// Retourne toutes les collections avec les produits populés
exports.getAll = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('collections')
      .populate({
        path: 'collections.productIds',
        select: 'nameFr nameAr price images city status type vendor isBoosted',
        options: { strictPopulate: false }
      });

    res.json({ success: true, collections: user?.collections || [] });
  } catch (err) { next(err); }
};

// ─── POST /api/collections ────────────────────────────────────────────────────
// Créer une collection
exports.create = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Nom requis' });

    const user = await User.findById(req.user._id).select('collections');
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });

    // Vérifier doublon
    if (!user.collections) user.collections = [];
    if (user.collections.some(c => c.name === name.trim())) {
      return res.status(409).json({ success: false, message: 'Une collection avec ce nom existe déjà' });
    }

    user.collections.push({ name: name.trim(), productIds: [] });
    await user.save({ validateBeforeSave: false });

    const col = user.collections[user.collections.length - 1];
    res.status(201).json({ success: true, collection: col });
  } catch (err) { next(err); }
};

// ─── PATCH /api/collections/:id/rename ───────────────────────────────────────
exports.rename = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Nom requis' });

    const user = await User.findById(req.user._id).select('collections');
    const col = user?.collections.id(req.params.id);
    if (!col) return res.status(404).json({ success: false, message: 'Collection introuvable' });

    col.name = name.trim();
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, collection: col });
  } catch (err) { next(err); }
};

// ─── DELETE /api/collections/:id ─────────────────────────────────────────────
exports.remove = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('collections');
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });

    user.collections = user.collections.filter(c => c._id.toString() !== req.params.id);
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'Collection supprimée' });
  } catch (err) { next(err); }
};

// ─── POST /api/collections/:id/products/:productId ───────────────────────────
// Ajouter un produit à une collection
exports.addProduct = async (req, res, next) => {
  try {
    const { id, productId } = req.params;
    if (!isValidId(productId)) return res.status(400).json({ success: false, message: 'ID produit invalide' });

    const user = await User.findById(req.user._id).select('collections');
    const col = user?.collections.id(id);
    if (!col) return res.status(404).json({ success: false, message: 'Collection introuvable' });

    if (!col.productIds.map(String).includes(productId)) {
      col.productIds.push(productId);
      await user.save({ validateBeforeSave: false });
    }
    res.json({ success: true, message: 'Produit ajouté', productCount: col.productIds.length });
  } catch (err) { next(err); }
};

// ─── DELETE /api/collections/:id/products/:productId ─────────────────────────
// Retirer un produit d'une collection
exports.removeProduct = async (req, res, next) => {
  try {
    const { id, productId } = req.params;

    const user = await User.findById(req.user._id).select('collections');
    const col = user?.collections.id(id);
    if (!col) return res.status(404).json({ success: false, message: 'Collection introuvable' });

    col.productIds = col.productIds.filter(pid => pid.toString() !== productId);
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'Produit retiré', productCount: col.productIds.length });
  } catch (err) { next(err); }
};

// ─── POST /api/collections/sync ──────────────────────────────────────────────
// Sync depuis localStorage (migration one-shot)
exports.sync = async (req, res, next) => {
  try {
    const { collections } = req.body; // { "Favoris": ["id1","id2"], "Maison": ["id3"] }
    if (!collections || typeof collections !== 'object') {
      return res.status(400).json({ success: false, message: 'Format invalide' });
    }

    const user = await User.findById(req.user._id).select('collections');
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });

    if (!user.collections) user.collections = [];
    for (const [name, productIds] of Object.entries(collections)) {
      if (!name?.trim() || !Array.isArray(productIds)) continue;
      const validIds = productIds.filter(id => isValidId(id));
      if (!validIds.length) continue;

      let col = user.collections.find(c => c.name === name.trim());
      if (!col) {
        user.collections.push({ name: name.trim(), productIds: validIds });
      } else {
        // Fusionner sans doublons
        const existing = col.productIds.map(String);
        validIds.forEach(id => { if (!existing.includes(id)) col.productIds.push(id); });
      }
    }

    await user.save({ validateBeforeSave: false });
    res.json({ success: true, collections: user.collections });
  } catch (err) { next(err); }
};
