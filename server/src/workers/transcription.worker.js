require('dotenv').config();
const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Memory = require('../models/Memory');
const { transcribeFromR2 } = require('../services/whisper.service');
const { connection } = require('../queues/transcription.queue');

const processJob = async (job) => {
  const { memoryId } = job.data;

  // Truth lives in the DB — fetch fresh, never trust the payload
  const memory = await Memory.findById(memoryId);

  if (!memory) {
    console.log(`[worker] memory ${memoryId} no longer exists, skipping`);
    return;
  }
  if (memory.status !== 'processing') {
    console.log(
      `[worker] memory ${memoryId} is '${memory.status}', not processing — skipping`
    );
    return;
  }

  console.log(`[worker] transcribing memory ${memoryId}…`);
  const transcript = await transcribeFromR2(memory.mediaKey);

  memory.transcript = transcript;
  memory.status = 'pending';
  await memory.save();
  console.log(`[worker] memory ${memoryId} → pending (${transcript.length} chars)`);
};

const start = async () => {
  await connectDB();

  const worker = new Worker('transcription', processJob, {
    connection,
    concurrency: 2,
  });

  worker.on('failed', async (job, err) => {
    console.error(`[worker] job ${job.id} failed: ${err.message}`);
    if (job.attemptsMade >= job.opts.attempts) {
      await Memory.findByIdAndUpdate(job.data.memoryId, {
        status: 'failed',
        failureReason: err.message,
      });
    }
  });

  console.log('[worker] transcription worker listening…');
};

start();