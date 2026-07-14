const DailyNote = require('../models/DailyNote');
const { createDailyNote } = require('../services/dailyNote.service');

// POST /api/patients/:patientId/daily — caregiver/admin posts a daily update
const postDailyNote = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }
    const note = await createDailyNote(req.params.patientId, req.userId, text);
    return res.status(201).json({
      note: { id: note._id, text: note.text, createdAt: note.createdAt },
    });
  } catch (err) {
    console.error('postDailyNote failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// GET /api/patients/:patientId/daily — today's timeline (non-expired notes)
const listDailyNotes = async (req, res) => {
  try {
    const notes = await DailyNote.find({ patient: req.params.patientId })
      .sort({ createdAt: -1 })
      .populate('author', 'name');
    return res.status(200).json({
      notes: notes.map((n) => ({
        id: n._id,
        text: n.text,
        author: n.author?.name || 'Someone',
        createdAt: n.createdAt,
        expiresAt: n.expiresAt,
      })),
    });
  } catch (err) {
    console.error('listDailyNotes failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

module.exports = { postDailyNote, listDailyNotes };