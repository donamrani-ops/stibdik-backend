const SiteConfig = require('../models/SiteConfig');

// GET /api/config/:key — public
exports.getConfig = async (req, res, next) => {
  try {
    const doc = await SiteConfig.findOne({ key: req.params.key }).lean();
    res.json({ success: true, value: doc?.value ?? null });
  } catch (err) { next(err); }
};

// PUT /api/config/:key — admin only
exports.setConfig = async (req, res, next) => {
  try {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ success: false, message: 'value requis' });
    const doc = await SiteConfig.findOneAndUpdate(
      { key: req.params.key },
      { value, updatedBy: req.user._id },
      { upsert: true, new: true }
    );
    res.json({ success: true, doc });
  } catch (err) { next(err); }
};

// GET /api/config — toutes les configs (admin)
exports.getAllConfigs = async (req, res, next) => {
  try {
    const configs = await SiteConfig.find().lean();
    res.json({ success: true, configs });
  } catch (err) { next(err); }
};
