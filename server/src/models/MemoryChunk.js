const mongoose = require('mongoose');

const memoryChunkSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    memory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Memory',
      required: true,
      index: true,
    },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MemoryChunk', memoryChunkSchema);