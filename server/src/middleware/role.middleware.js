const mongoose = require('mongoose');  
const FamilyMembership = require('../models/FamilyMembership');

const requireRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      const patientId = req.params.patientId || req.body.patientId;

      if (!patientId || !mongoose.Types.ObjectId.isValid(patientId)) {
        return res.status(404).json({ error: 'patient not found' });
      }
      const membership = await FamilyMembership.findOne({
        user: req.userId,
        patient: patientId,
        status: 'active',
      });

      if (!membership || !allowedRoles.includes(membership.role)) {
        return res
          .status(403)
          .json({ error: 'you do not have permission for this action' });
      }

      req.membership = membership;
      return next();
    } catch (err) {
      console.error('role check failed:', err);
      return res.status(500).json({ error: 'something went wrong' });
    }
  };
};

module.exports = { requireRole };