const mongoose = require('mongoose');

const ROLES = ['familyAdmin', 'contributor', 'attendant', 'clinician'];

const familyMembershipSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
    },
    role: { type: String, enum: ROLES, required: true },
    status: {
      type: String,
      enum: ['invited', 'active', 'removed'],
      default: 'active',
    },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

familyMembershipSchema.index({ user: 1, patient: 1 }, { unique: true });

familyMembershipSchema.statics.ROLES = ROLES;

module.exports = mongoose.model('FamilyMembership', familyMembershipSchema);