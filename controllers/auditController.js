// Controller: AuditLog
const AuditLog = require('../models/AuditLog');

// GET /api/audit — liste des logs (admin)
exports.getLogs = async (req, res, next) => {
  try {
    const { page=1, limit=50, action, targetType } = req.query;
    const filter = {};
    if (action)     filter.action     = action;
    if (targetType) filter.targetType = targetType;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('admin', 'name email')
        .sort('-createdAt')
        .limit(limit*1)
        .skip((page-1)*limit),
      AuditLog.countDocuments(filter)
    ]);

    res.json({ success: true, logs, total, page: parseInt(page), pages: Math.ceil(total/limit) });
  } catch(err) { next(err); }
};

// GET /api/audit/target/:type/:id — logs sur une cible spécifique
exports.getTargetLogs = async (req, res, next) => {
  try {
    const logs = await AuditLog.find({ targetType: req.params.type, targetId: req.params.id })
      .populate('admin', 'name email')
      .sort('-createdAt')
      .limit(20);
    res.json({ success: true, logs });
  } catch(err) { next(err); }
};
