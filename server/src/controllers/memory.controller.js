const mongoose = require('mongoose');
const Memory = require('../models/Memory');
const Interaction = require('../models/Interaction');
const Consent = require('../models/Consent');
const { uploadAudio } = require('../services/storage.service');
const { transcriptionQueue } = require('../queues/transcription.queue');
const { embeddingQueue } = require('../queues/embedding.queue');
const { audit } = require('../services/audit.service');
const { hourIn } = require('../utils/time');

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

    audit(patientId, req.userId, 'memory.uploaded', memory._id.toString(), { title });

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
    if (!mongoose.Types.ObjectId.isValid(req.params.memoryId)) {
      return res.status(404).json({ error: 'memory not found' });
    }

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

// GET /api/patients/:patientId/memories — list with optional status filter
const listMemories = async (req, res) => {
  try {
    const filter = { patient: req.params.patientId };

    if (req.query.status) {
      const allowed = ['processing', 'failed', 'pending', 'approved', 'rejected'];
      if (!allowed.includes(req.query.status)) {
        return res.status(400).json({ error: 'invalid status filter' });
      }
      filter.status = req.query.status;
    }

    const memories = await Memory.find(filter)
      .sort({ createdAt: -1 })
      .select('-transcript')
      .populate('uploadedBy', 'name');

    return res.status(200).json({ memories });
  } catch (err) {
    console.error('listMemories failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// POST /api/patients/:patientId/memories/:memoryId/review — approve or reject
const reviewMemory = async (req, res) => {
  try {
    const { decision } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res
        .status(400)
        .json({ error: "decision must be 'approved' or 'rejected'" });
    }

    const memory = await Memory.findOne({
      _id: req.params.memoryId,
      patient: req.params.patientId,
    });
    if (!memory) {
      return res.status(404).json({ error: 'memory not found' });
    }
    if (memory.status !== 'pending') {
      return res.status(409).json({
        error: `only pending memories can be reviewed (this one is '${memory.status}')`,
      });
    }

    memory.status = decision;
    memory.approvedBy = req.userId;

    try {
      await memory.save();
    } catch (err) {
      if (err.message.includes('cannot be approved by its uploader')) {
        return res
          .status(403)
          .json({ error: 'you cannot review a memory you uploaded yourself' });
      }
      throw err;
    }

    // approved memories enter the embedding pipeline
    if (decision === 'approved') {
      await embeddingQueue.add('embed', { memoryId: memory._id.toString() });
    }

    audit(req.params.patientId, req.userId, 'memory.' + decision, memory._id.toString());

    return res.status(200).json({
      memory: { id: memory._id, status: memory.status },
    });
  } catch (err) {
    console.error('reviewMemory failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// GET /api/patients/:patientId/memories/search?q=... — raw retrieval test
const searchMemories = async (req, res) => {
  try {
    const question = req.query.q;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'query parameter q is required' });
    }

    const { retrieveChunks } = require('../services/retrieval.service');
    const chunks = await retrieveChunks(req.params.patientId, question);

    return res.status(200).json({ question, chunks });
  } catch (err) {
    console.error('searchMemories failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// POST /api/patients/:patientId/ask — the Mirror's question endpoint
const askQuestion = async (req, res) => {
  try {
    const { question, perspective } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'question is required' });
    }

    const Consent = require('../models/Consent');
    const consent = await Consent.findOne({ patient: req.params.patientId });
    if (consent && consent.state === 'frozen') {
      return res.status(403).json({ error: 'this memory bank is currently frozen' });
    }

    const Patient = require('../models/Patient');
    
    const patient = await Patient.findById(req.params.patientId);
    if (!patient) {
      return res.status(404).json({ error: 'patient not found' });
    }

    const { answerQuestion } = require('../services/answer.service');
    const result = await answerQuestion(
      req.params.patientId,
      patient.name,
      question,
      perspective === 'family' ? 'family' : 'patient'
    );

    // fire-and-forget interaction log — never block or fail the answer
     if (perspective !== 'family') {
    Interaction.create({
      patient: req.params.patientId,
      question: question.trim(),
      normalizedQuestion: question.trim().toLowerCase().replace(/[?!.,]/g, ''),
      refused: result.refused,
      topScore: result.sources[0]?.score,
      hourOfDay: hourIn(patient.timezone),
    }).catch((e) => console.error('interaction log failed:', e.message));
  }
    return res.status(200).json(result);
  } catch (err) {
    console.error('askQuestion failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// POST /api/patients/:patientId/speak — TTS for an answer text
const speakText = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }
    if (text.length > 500) {
      return res.status(400).json({ error: 'text too long' });
    }

    const Consent = require('../models/Consent');
    const consent = await Consent.findOne({ patient: req.params.patientId });
    if (consent && consent.state === 'frozen') {
      return res.status(403).json({ error: 'this memory bank is currently frozen' });
    }

    const { speak } = require('../services/tts.service');
    const { audio, cached } = await speak(req.params.patientId, text.trim());

    res.set('Content-Type', 'audio/wav');
    res.set('X-TTS-Cache', cached ? 'hit' : 'miss');
    return res.status(200).send(audio);
  } catch (err) {
    console.error('speakText failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

module.exports = { createAudioMemory, getMemory, listMemories, reviewMemory, searchMemories, askQuestion, speakText };