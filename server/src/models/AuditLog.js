const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    target: { type: String },
    detail: { type: Object },
  },
  { timestamps: true }
);

auditLogSchema.index({ patient: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);