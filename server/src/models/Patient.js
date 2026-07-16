const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date },
    photoUrl: { type: String },
    preferredLanguage: {
      type: String,
      enum: ['hi', 'en', 'hi-en'],
      default: 'hi-en',
    },
    timezone: { type: String, default: 'Asia/Kolkata' },
    stage: {
      type: String,
      enum: ['early', 'middle', 'late'],
      default: 'early',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Patient', patientSchema);