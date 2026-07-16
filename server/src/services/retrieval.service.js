const mongoose = require('mongoose');
const MemoryChunk = require('../models/MemoryChunk');
const DailyNote = require('../models/DailyNote');
const { embedText } = require('./embedding.service');

const TOP_K = 4;

// Raw cosine similarity: [-1, 1]
const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

/**
 * Atlas $vectorSearch does NOT return raw cosine — for `cosine` similarity it
 * normalizes to [0, 1] as (1 + cos) / 2. Our in-memory daily-note search must
 * apply the SAME transform, or the two streams end up on different scales and
 * the merged ranking is meaningless: a bio chunk at true cosine 0.70 would
 * report 0.85 and beat a daily note at true cosine 0.79 reporting 0.79.
 * Same ruler, or don't compare the measurements.
 */
const toAtlasScale = (cos) => (1 + cos) / 2;

const retrieveChunks = async (patientId, question) => {
  // 1. Embed the question — note the QUERY task type
  const queryVector = await embedText(question, 'RETRIEVAL_QUERY');

  // 2. Biographical memories: Atlas vector search, scoped to this patient
  const bio = await MemoryChunk.aggregate([
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

  const bioResults = bio.map((r) => ({ ...r, source: 'memory' }));

  // 3. Daily notes: small 48h set, cosine in memory — normalized to match Atlas
  const dailyNotes = await DailyNote.find({ patient: patientId }).lean();
  const dailyResults = dailyNotes
    .filter((n) => Array.isArray(n.embedding) && n.embedding.length)
    .map((n) => ({
      text: n.text,
      memory: n._id,
      chunkIndex: 0,
      score: toAtlasScale(cosine(queryVector, n.embedding)),
      source: 'daily',
    }));

  // 4. Merge both streams, re-rank by score, take the global top-k
  const merged = [...bioResults, ...dailyResults]
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  return merged;
};

module.exports = { retrieveChunks };