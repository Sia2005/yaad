const mongoose = require('mongoose');

const personSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    // How SHE should hear it: "aapka pota", "aapki chhoti bahen"
    relationship: { type: String, required: true, trim: true },
    photoKey: { type: String }, // R2 object key, never a public URL
    story: { type: String, trim: true }, // one warm line, spoken to her
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
);

// Two-person approval, enforced by the schema — same rule as Memory.
// A person card tells her who someone IS. One relative should never be able
// to introduce a stranger into her family on their own say-so.
personSchema.pre('save', function () {
  if (this.status === 'approved') {
    if (!this.approvedBy) {
      throw new Error('an approved person card must record who approved it');
    }
    if (this.approvedBy.equals(this.addedBy)) {
      throw new Error(
        'a person card must be approved by someone other than whoever added it'
      );
    }
  }
});

module.exports = mongoose.model('Person', personSchema);