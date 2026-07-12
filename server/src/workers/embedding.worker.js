require('dotenv').config();
const { Worker } = require('bullmq');
const connectDB = require('../config/db');
const Memory = require('../models/Memory');
const MemoryChunk = require('../models/MemoryChunk');
const { chunkText } = require('../services/chunking.service');
const { embedText } = require('../services/embedding.service');
const { connection } = require('../queues/transcription.queue');

const processJob = async (job) => {
  const { memoryId } = job.data;

  const memory = await Memory.findById(memoryId);
  if (!memory) return console.log(`[embed] ${memoryId} gone, skipping`);
  if (memory.status !== 'approved')
    return console.log(`[embed] ${memoryId} is '${memory.status}', skipping`);
  if (!memory.transcript || !memory.transcript.trim())
    return console.log(`[embed] ${memoryId} has empty transcript, skipping`);

  // Idempotency: wipe any chunks from a previous (partial) run, then rebuild
  await MemoryChunk.deleteMany({ memory: memory._id });

  const chunks = chunkText(memory.transcript);
  console.log(`[embed] ${memoryId}: ${chunks.length} chunk(s)`);

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embedText(chunks[i]);
    await MemoryChunk.create({
      patient: memory.patient,
      memory: memory._id,
      chunkIndex: i,
      text: chunks[i],
      embedding,
    });
  }

  console.log(`[embed] ${memoryId} → corpus`);
};

const start = async () => {
  await connectDB();
  new Worker('embedding', processJob, { connection, concurrency: 1 });
  console.log('[embed] embedding worker listening…');
};

start();