// Routes: Upload (Cloudinary)
const express = require('express');
const router = express.Router();
const multer = require('multer');
const uploadController = require('../controllers/uploadController');
const { protect, authorize } = require('../middleware/auth');

// Multer en memory storage : on garde le fichier en RAM le temps de l'envoyer à Cloudinary
// Avantage : Render n'a pas de filesystem persistent, donc disk storage ne marcherait pas
const storage = multer.memoryStorage();

// Filtre des types MIME acceptés
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non autorisé: ${file.mimetype}. Formats acceptés: JPEG, PNG, WebP, GIF.`), false);
  }
};

// Limites : 5 MB max par fichier, 5 fichiers max par requête
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 5
  }
});

// Middleware d'erreur Multer (pour avoir des messages propres au lieu d'un crash)
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Fichier trop volumineux (max 5 MB)'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Trop de fichiers (max 5)'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: `Champ inattendu: ${err.field}. Utilisez "image" ou "images".`
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

// Toutes les routes nécessitent une authentification
router.use(protect);

// Vendor & Admin uniquement (les customers n'ont pas à uploader)
router.use(authorize('vendor', 'admin'));

// Single file upload (clé "image")
router.post(
  '/image',
  upload.single('image'),
  handleMulterError,
  uploadController.uploadImage
);

// Multiple files upload (clé "images", max 5)
router.post(
  '/images',
  upload.array('images', 5),
  handleMulterError,
  uploadController.uploadImages
);

// Suppression d'une image (publicId encodé dans l'URL)
// Note: les publicIds Cloudinary contiennent des slashes (ex: "stibdik/products/abc/photo123"),
// on utilise une regex pour matcher tout ce qui suit /image/
router.delete('/image/:publicId(*)', uploadController.deleteImage);

module.exports = router;
