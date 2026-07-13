const mongoose = require('mongoose');

const interactionSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    question: { type: String, required: true },
    normalizedQuestion: { type: String, required: true, index: true },
    refused: { type: Boolean, default: false },
    topScore: { type: Number },
    hourOfDay: { type: Number, required: true }, // 0-23, for sundowning buckets
  },
  { timestamps: true }
);

interactionSchema.index({ patient: 1, createdAt: -1 });

module.exports = mongoose.model('Interaction', interactionSchema);