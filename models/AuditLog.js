// Model: AuditLog — journal de modération
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // Qui a fait l'action
  admin:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adminName:  { type: String },

  // L'action
  action:     {
    type: String,
    enum: ['user.suspend','user.unsuspend','user.delete','user.role_change',
           'user.reset_password','product.disable','product.enable','product.delete',
           'review.hide','review.delete','order.cancel','coupon.create','coupon.delete',
           'boost.activate','boost.cancel','category.create','category.delete'],
    required: true
  },

  // La cible
  targetType: { type: String, enum: ['user','product','review','order','coupon','boost','category'], required: true },
  targetId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  targetName: { type: String }, // nom/email de la cible pour affichage

  // Détail
  details:    { type: mongoose.Schema.Types.Mixed },
  ip:         { type: String },
  userAgent:  { type: String }

}, { timestamps: true });

auditLogSchema.index({ admin: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

// Helper statique pour créer un log facilement
auditLogSchema.statics.log = async function(adminUser, action, target, details={}, req=null) {
  try {
    await this.create({
      admin:      adminUser._id || adminUser.id,
      adminName:  adminUser.name || adminUser.email,
      action,
      targetType: target.type,
      targetId:   target.id,
      targetName: target.name || String(target.id),
      details,
      ip:         req?.ip || req?.connection?.remoteAddress,
      userAgent:  req?.headers?.['user-agent']?.substring(0, 200)
    });
  } catch(err) {
    // Log silencieux — ne jamais bloquer l'action principale
    console.error('AuditLog error (non-fatal):', err.message);
  }
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
