const mongoose = require('mongoose');

const consentSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      unique: true,
    },
    state: {
      type: String,
      enum: ['active', 'delegated', 'frozen'],
      default: 'active',
    },
    voiceCloningPermitted: { type: Boolean, default: false },
    delegatedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Consent', consentSchema);