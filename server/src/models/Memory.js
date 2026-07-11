const mongoose = require('mongoose');

const memorySchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['audio', 'photo', 'story'],
      required: true,
    },
    title: { type: String, trim: true },
    mediaKey: { type: String }, // R2 object key, e.g. patients/<id>/audio/<uuid>.opus
    transcript: { type: String },
    peopleTagged: [{ name: String, relation: String }],
    status: {
      type: String,
      enum: ['processing', 'failed', 'pending', 'approved', 'rejected'],
      default: 'processing',
      index: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    failureReason: { type: String },
  },
  { timestamps: true }
);

// The anti-poisoning rule, enforced at the schema level
memorySchema.pre('save', function (next) {
  if (
    this.status === 'approved' &&
    this.approvedBy &&
    this.approvedBy.equals(this.uploadedBy)
  ) {
    return next(new Error('a memory cannot be approved by its uploader'));
  }
  next();
});

module.exports = mongoose.model('Memory', memorySchema);