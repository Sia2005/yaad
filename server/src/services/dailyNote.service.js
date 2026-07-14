const DailyNote = require('../models/DailyNote');
const { embedText } = require('./embedding.service');

const EXPIRY_HOURS = 48;

// create a daily note, embed it so the Mirror can retrieve it
const createDailyNote = async (patientId, authorId, text) => {
  const embedding = await embedText(text, 'RETRIEVAL_DOCUMENT');
  const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000);

  const note = await DailyNote.create({
    patient: patientId,
    author: authorId,
    text: text.trim(),
    embedding,
    expiresAt,
  });

  return note;
};

module.exports = { createDailyNote };