const Memory = require('../models/Memory');
const { uploadAudio } = require('../services/storage.service');
const { transcriptionQueue } = require('../queues/transcription.queue');

// POST /api/patients/:patientId/memories — familyAdmin or contributor
const createAudioMemory = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'an audio file is required' });
    }

    const { patientId } = req.params;
    const { title } = req.body;

    const mediaKey = await uploadAudio(
      patientId,
      req.file.buffer,
      req.file.mimetype
    );

    const memory = await Memory.create({
      patient: patientId,
      uploadedBy: req.userId,
      type: 'audio',
      title,
      mediaKey,
      status: 'processing',
    });

    await transcriptionQueue.add('transcribe', { memoryId: memory._id.toString() });

    return res.status(202).json({
      memory: { id: memory._id, status: memory.status, title: memory.title },
    });
  } catch (err) {
    console.error('createAudioMemory failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// GET /api/patients/:patientId/memories/:memoryId — poll status
const getMemory = async (req, res) => {
  try {
    const memory = await Memory.findOne({
      _id: req.params.memoryId,
      patient: req.params.patientId,
    });
    if (!memory) {
      return res.status(404).json({ error: 'memory not found' });
    }
    return res.status(200).json({ memory });
  } catch (err) {
    console.error('getMemory failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

module.exports = { createAudioMemory, getMemory };