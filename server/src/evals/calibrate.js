/**
 * Yaad — retrieval threshold calibration
 *
 *   npm run calibrate
 *
 * MIN_SCORE is the score floor below which retrieved chunks are treated as
 * noise and the Mirror refuses instead of answering. It was set to 0.55 by
 * guess, against a corpus of one memory — so it has never once fired.
 *
 * This script measures where it should actually sit. It runs two sets of
 * questions through the REAL retrieval pipeline:
 *
 *   ANSWERABLE  — the corpus genuinely contains the answer. High scores wanted.
 *   MUST_REFUSE — the corpus genuinely does not. Low scores wanted.
 *
 * If those two distributions separate cleanly, the floor belongs in the gap
 * between them, and we can say so with a number instead of a vibe.
 */

process.env.TZ = 'Asia/Kolkata';
require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Patient = require('../models/Patient');
const { retrieveChunks } = require('../services/retrieval.service');

const PATIENT_NAME = 'Kamala Sharma';

// ---------------------------------------------------------------- the cases
// Answers that ARE in her memory bank or today's log.
const ANSWERABLE = [
  { q: 'meri shaadi mein maine kya pehna tha?',   expect: 'laal lehenga, 1962' },
  { q: 'main kahan padhati thi?',                 expect: 'Nagpur school' },
  { q: 'mere pati ka naam kya tha?',              expect: 'Ramesh' },
  { q: 'Pune wale ghar ke saamne kya tha?',       expect: 'neem ka ped' },
  { q: 'Arjun kab paida hua tha?',                expect: '1999' },
  { q: 'main kya banati thi?',                    expect: 'besan ke laddoo' },
  { q: 'mera gaon kaisa tha?',                    expect: 'Vidarbha, kuan' },
  { q: 'mujhe kaunse gaane pasand hain?',         expect: 'Lata Mangeshkar' },
  { q: 'maine aaj subah kya khaya?',              expect: 'poha (daily note)' },
  { q: 'aaj mujhse milne kaun aaya?',             expect: 'Arjun (daily note)' },
];

// Answers that are NOT in the corpus. The right response is a refusal.
// Deliberately includes near-misses — questions that brush against a real
// memory without being answerable by it. Those are where a floor earns its pay.
const MUST_REFUSE = [
  { q: 'mera bank account number kya hai?',       why: 'never recorded' },
  { q: 'ghar kiske naam par hai?',                why: 'property — the poisoning scenario' },
  { q: 'mera favourite cricket player kaun hai?', why: 'nothing about cricket' },
  { q: 'main kaunsi car chalati thi?',            why: 'nothing about cars' },
  { q: 'mera passport number kya hai?',           why: 'never recorded' },
  { q: 'meri behen ka naam kya hai?',             why: 'NEAR MISS — sisters mentioned, never named' },
  { q: 'Delhi mein main kab rehti thi?',          why: 'NEAR MISS — she lived in Nagpur and Pune' },
  { q: 'Ramesh ji ne kaunsa college kiya tha?',   why: 'NEAR MISS — he exists, his college does not' },
  { q: 'kal main kya karungi?',                   why: 'the future is not a memory' },
  { q: 'meri pension kitni aati hai?',            why: 'money — never recorded' },
];

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const topScoreFor = async (patientId, question) => {
  const MAX = 4;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      const chunks = await retrieveChunks(patientId, question);
      return chunks.length ? chunks[0].score : 0;
    } catch (err) {
      const transient = /\(429\)|\(500\)|\(503\)|quota|rate|timeout|ECONNRESET|fetch failed/i.test(
        String(err.message || err)
      );
      if (!transient || attempt === MAX) throw err;
      await sleep(2 ** attempt * 1000);
    }
  }
};

const bar = (score) => {
  const filled = Math.round(score * 40);
  return '█'.repeat(filled) + '·'.repeat(40 - filled);
};

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return {
    min: s[0],
    max: s[s.length - 1],
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    median: s[Math.floor(s.length / 2)],
  };
};

// ---------------------------------------------------------------- run
const run = async () => {
  const patient = await Patient.findOne({ name: PATIENT_NAME });
  if (!patient) {
    throw new Error(
      `no patient named "${PATIENT_NAME}" — run \`npm run seed\` first`
    );
  }

  console.log(`\n  Calibrating against ${patient.name}'s corpus`);
  console.log(`  ${ANSWERABLE.length} answerable · ${MUST_REFUSE.length} must-refuse\n`);

  const results = { answerable: [], refuse: [] };

  console.log('  ANSWERABLE — the corpus knows this. High scores wanted.');
  console.log('  ' + '─'.repeat(76));
  for (const c of ANSWERABLE) {
    const score = await topScoreFor(patient._id, c.q);
    results.answerable.push(score);
    console.log(`  ${score.toFixed(4)}  ${bar(score)}  ${c.q}`);
    await sleep(250);
  }

  console.log('\n  MUST REFUSE — the corpus does not know this. Low scores wanted.');
  console.log('  ' + '─'.repeat(76));
  for (const c of MUST_REFUSE) {
    const score = await topScoreFor(patient._id, c.q);
    results.refuse.push(score);
    const flag = c.why.startsWith('NEAR MISS') ? ' ⚠' : '';
    console.log(`  ${score.toFixed(4)}  ${bar(score)}  ${c.q}${flag}`);
    await sleep(250);
  }

  // ------------------------------------------------------------ the verdict
  const a = stats(results.answerable);
  const r = stats(results.refuse);

  console.log('\n  ' + '═'.repeat(76));
  console.log('  DISTRIBUTIONS');
  console.log('  ' + '─'.repeat(76));
  console.log(`  answerable   min ${a.min.toFixed(4)}   median ${a.median.toFixed(4)}   max ${a.max.toFixed(4)}`);
  console.log(`  must-refuse  min ${r.min.toFixed(4)}   median ${r.median.toFixed(4)}   max ${r.max.toFixed(4)}`);

  const gap = a.min - r.max;
  console.log('\n  SEPARATION');
  console.log('  ' + '─'.repeat(76));

  if (gap > 0) {
    const recommended = r.max + gap / 2;
    console.log(`  Clean separation. Nothing answerable scores below ${a.min.toFixed(4)};`);
    console.log(`  nothing unanswerable scores above ${r.max.toFixed(4)}.`);
    console.log(`  Gap: ${gap.toFixed(4)}\n`);
    console.log(`  → MIN_SCORE = ${recommended.toFixed(2)}   (midpoint of the gap)`);
    console.log(`\n  Current MIN_SCORE = 0.55 sits ${(r.min - 0.55).toFixed(4)} BELOW even the`);
    console.log(`  lowest must-refuse score — which is why it has never fired.`);
  } else {
    console.log(`  OVERLAP of ${Math.abs(gap).toFixed(4)} — some unanswerable questions score`);
    console.log(`  higher than some answerable ones. No floor separates them perfectly.\n`);
    const candidates = [];
    for (let t = 0.5; t <= 0.95; t += 0.01) {
      const falseRefusals = results.answerable.filter((s) => s < t).length;
      const passedThrough = results.refuse.filter((s) => s >= t).length;
      candidates.push({ t, falseRefusals, passedThrough, cost: falseRefusals * 2 + passedThrough });
    }
    candidates.sort((x, y) => x.cost - y.cost);
    const best = candidates[0];
    console.log(`  → MIN_SCORE = ${best.t.toFixed(2)}`);
    console.log(`     wrongly refuses ${best.falseRefusals}/${ANSWERABLE.length} answerable`);
    console.log(`     lets ${best.passedThrough}/${MUST_REFUSE.length} unanswerable through to the LLM`);
    console.log(`\n  (False refusals weighted 2x: telling her "mujhe yaad nahi" about a real`);
    console.log(`   memory is worse than leaning on the LLM's refusal, which is layer two.)`);
  }

  console.log('\n  ' + '═'.repeat(76));
  console.log('  The floor is layer one. The LLM refusal instruction is layer two.');
  console.log('  A must-refuse question crossing the floor is not a failure — it just');
  console.log('  means layer two has to catch it. Run the eval suite to confirm it does.');
  console.log('  ' + '═'.repeat(76) + '\n');
};

const main = async () => {
  await connectDB();
  try {
    await run();
  } catch (err) {
    console.error('\n[calibrate] FAILED:', err.message, '\n');
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

main();