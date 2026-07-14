const mongoose = require('mongoose');

const dailyNoteSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    embedding: { type: [Number] }, // 768-dim, for the Mirror to retrieve
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// TTL index: MongoDB automatically deletes docs once expiresAt passes.
// This is the whole expiry mechanism — no cron job needed.
dailyNoteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('DailyNote', dailyNoteSchema);