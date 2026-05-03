// Controller: Upload (Cloudinary)
const cloudinary = require('cloudinary').v2;

// Configurer Cloudinary depuis les env vars
// CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Vérifier la config au démarrage
const isConfigured = () => {
  return !!(process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET);
};

if (!isConfigured()) {
  console.warn('⚠️  Cloudinary non configuré : les uploads d\'images vont échouer. Configurez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET dans les variables d\'environnement.');
} else {
  console.log(`📸 Cloudinary configuré (cloud: ${process.env.CLOUDINARY_CLOUD_NAME})`);
}

// Helper : upload depuis un buffer Multer vers Cloudinary
const uploadBufferToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || 'stibdik/products',
        resource_type: 'image',
        // Limite côté Cloudinary : si l'image fait + de 1600x1600, on la réduit
        // Préserve le ratio. Format optimisé selon le navigateur (webp/avif/jpg)
        transformation: [
          { width: 1600, height: 1600, crop: 'limit' },
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ],
        ...options
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
};

// @desc    Upload une image (multipart/form-data)
// @route   POST /api/upload/image
// @access  Authenticated (vendor / admin pour publier des produits)
exports.uploadImage = async (req, res, next) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Service d\'upload non configuré. Contactez l\'admin.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier fourni (clé attendue : "image")'
      });
    }

    // Tag optionnel pour grouper les uploads par user
    const userId = req.user?._id?.toString();
    const folder = userId ? `stibdik/products/${userId}` : 'stibdik/products';

    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder,
      // Tags pour pouvoir purger plus tard si besoin
      tags: userId ? [`user:${userId}`] : []
    });

    res.status(200).json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes
    });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    next(error);
  }
};

// @desc    Upload plusieurs images en une seule requête
// @route   POST /api/upload/images
// @access  Authenticated
exports.uploadImages = async (req, res, next) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Service d\'upload non configuré. Contactez l\'admin.'
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier fourni (clé attendue : "images")'
      });
    }

    const userId = req.user?._id?.toString();
    const folder = userId ? `stibdik/products/${userId}` : 'stibdik/products';

    // Upload en parallèle (limité par le rate-limit Cloudinary)
    const results = await Promise.all(
      req.files.map(file => uploadBufferToCloudinary(file.buffer, {
        folder,
        tags: userId ? [`user:${userId}`] : []
      }))
    );

    res.status(200).json({
      success: true,
      count: results.length,
      images: results.map(r => ({
        url: r.secure_url,
        publicId: r.public_id,
        width: r.width,
        height: r.height,
        format: r.format,
        bytes: r.bytes
      }))
    });
  } catch (error) {
    console.error('Cloudinary multi-upload error:', error);
    next(error);
  }
};

// @desc    Supprimer une image (utile quand on supprime/édite un produit)
// @route   DELETE /api/upload/image/:publicId
// @access  Authenticated (vendor / admin)
exports.deleteImage = async (req, res, next) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Service d\'upload non configuré'
      });
    }

    // Le publicId peut contenir des slashes (ex: stibdik/products/abc/photo123)
    // On le récupère depuis req.params.publicId mais Express le décode automatiquement
    const publicId = req.params.publicId;

    if (!publicId) {
      return res.status(400).json({ success: false, message: 'publicId manquant' });
    }

    // Sécurité : ne supprimer que les images dans le dossier de l'utilisateur
    // (évite qu'un user supprime les images d'un autre)
    const userId = req.user?._id?.toString();
    if (req.user?.role !== 'admin' && userId && !publicId.includes(`/${userId}/`)) {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé à supprimer cette image'
      });
    }

    const result = await cloudinary.uploader.destroy(publicId);

    if (result.result !== 'ok' && result.result !== 'not found') {
      return res.status(500).json({
        success: false,
        message: 'Erreur Cloudinary',
        result
      });
    }

    res.status(200).json({
      success: true,
      result: result.result // 'ok' ou 'not found'
    });
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    next(error);
  }
};
