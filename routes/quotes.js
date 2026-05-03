// Routes: Quotes (RFQ)
const express = require('express');
const router = express.Router();
const quoteController = require('../controllers/quoteController');
const { protect, authorize } = require('../middleware/auth');

// Middleware optionnel : si token présent, on attache req.user, sinon on continue.
// Permet à POST /api/quotes d'enregistrer userId si l'utilisateur est connecté
const tryAttachUser = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      // On délègue au middleware protect mais on intercepte ses erreurs
      // pour que le POST reste public même avec un token invalide
      await new Promise((resolve) => {
        protect(req, res, (err) => {
          if (err) req.user = null;
          resolve();
        });
      });
    } catch (e) {
      req.user = null;
    }
  }
  next();
};

// PUBLIC: créer une demande de devis (token optionnel)
router.post('/', tryAttachUser, quoteController.createQuote);

// PROTECTED: tout le reste exige un user authentifié
router.use(protect);

// Vendor / Admin
router.get('/received', authorize('vendor', 'admin'), quoteController.getReceivedQuotes);
router.get('/stats', authorize('vendor', 'admin'), quoteController.getVendorQuoteStats);

// Détail / actions sur une quote précise
router.get('/:id', quoteController.getQuote);
router.patch('/:id/read', quoteController.markRead);
router.patch('/:id/status', quoteController.updateStatus);
router.delete('/:id', quoteController.deleteQuote);

module.exports = router;
