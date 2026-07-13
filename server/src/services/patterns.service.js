const Interaction = require('../models/Interaction');

const DAYS = 7;
const REPEAT_THRESHOLD = 5;      // same question ≥5 times in a day
const EVENING_RATIO_FLAG = 0.6;  // >60% of activity in 17:00–22:00

const getPatterns = async (patientId) => {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  // 1. Repeated questions per day
  const repeats = await Interaction.aggregate([
    { $match: { patient: patientId, createdAt: { $gte: since } } },
    {
      $group: {
        _id: {
          q: '$normalizedQuestion',
          day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gte: REPEAT_THRESHOLD } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  // 2. Hour-of-day distribution
  const hourBuckets = await Interaction.aggregate([
    { $match: { patient: patientId, createdAt: { $gte: since } } },
    { $group: { _id: '$hourOfDay', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  const total = hourBuckets.reduce((s, b) => s + b.count, 0);
  const evening = hourBuckets
    .filter((b) => b._id >= 17 && b._id <= 22)
    .reduce((s, b) => s + b.count, 0);
  const eveningRatio = total ? evening / total : 0;

  // 3. Build alerts — flag language only, never diagnostic
  const alerts = [];

  for (const r of repeats) {
    alerts.push({
      type: 'repeated_question',
      severity: 'info',
      message: `"${r._id.q}" was asked ${r.count} times on ${r._id.day}. This may be worth mentioning at the next doctor visit.`,
    });
  }

  if (total >= 20 && eveningRatio >= EVENING_RATIO_FLAG) {
    alerts.push({
      type: 'evening_activity',
      severity: 'info',
      message: `${Math.round(eveningRatio * 100)}% of questions this week came between 5–10 PM. Evening restlessness patterns can be worth mentioning to a doctor.`,
    });
  }

  return { windowDays: DAYS, totalInteractions: total, hourBuckets, alerts };
};

module.exports = { getPatterns };