// Routes: Collections
const express = require('express');
const router  = express.Router();
const cc      = require('../controllers/collectionsController');
const { protect } = require('../middleware/auth');

router.use(protect); // toutes les routes nécessitent auth

router.get('/',                            cc.getAll);
router.post('/',                           cc.create);
router.post('/sync',                       cc.sync);
router.patch('/:id/rename',               cc.rename);
router.delete('/:id',                     cc.remove);
router.post('/:id/products/:productId',   cc.addProduct);
router.delete('/:id/products/:productId', cc.removeProduct);

module.exports = router;
