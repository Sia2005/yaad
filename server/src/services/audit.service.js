const AuditLog = require('../models/AuditLog');

// fire-and-forget — auditing must never break the operation it observes
const audit = (patient, actor, action, target, detail = {}) => {
  AuditLog.create({ patient, actor, action, target, detail }).catch((e) =>
    console.error('audit write failed:', e.message)
  );
};

module.exports = { audit };