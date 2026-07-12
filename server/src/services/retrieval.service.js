const mongoose = require('mongoose');
const MemoryChunk = require('../models/MemoryChunk');
const { embedText } = require('./embedding.service');

const TOP_K = 4;

const retrieveChunks = async (patientId, question) => {
  // 1. Embed the question — note the QUERY task type
  const queryVector = await embedText(question, 'RETRIEVAL_QUERY');

  // 2. Vector search, scoped to this patient
  const results = await MemoryChunk.aggregate([
    {
      $vectorSearch: {
        index: 'chunk_vector_index',
        path: 'embedding',
        queryVector,
        numCandidates: 100,
        limit: TOP_K,
        filter: {
          patient: new mongoose.Types.ObjectId(patientId),
        },
      },
    },
    {
      $project: {
        text: 1,
        memory: 1,
        chunkIndex: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ]);

  return results;
};

module.exports = { retrieveChunks };