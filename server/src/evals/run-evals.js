require('dotenv').config();
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/db');
const { answerQuestion } = require('../services/answer.service');
const { retrieveChunks } = require('../services/retrieval.service');
const Patient = require('../models/Patient');

const PATIENT_ID = process.argv[2];
const DELAY_MS = 7000; // free tier ≈ 10 req/min — stay under it

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const withRetry = async (fn, label, attempts = 3) => {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const transient = /503|429|UNAVAILABLE|overloaded/i.test(err.message);
      if (!transient || i === attempts) throw err;
      const wait = 15000 * i; // 15s, 30s
      console.log(`  [${label}] transient error (attempt ${i}/${attempts}), waiting ${wait / 1000}s…`);
      await sleep(wait);
    }
  }
};

const topScore = async (patientId, question) => {
  const chunks = await retrieveChunks(patientId, question);
  return chunks.length ? chunks[0].score : 0;
};

const run = async () => {
  if (!PATIENT_ID) {
    console.error('usage: node src/evals/run-evals.js <patientId>');
    process.exit(1);
  }

  await connectDB();
  const patient = await Patient.findById(PATIENT_ID);
  if (!patient) {
    console.error('patient not found');
    process.exit(1);
  }

  const cases = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8')
  );

  const results = { answerable: [], mustRefuse: [] };

  for (const c of cases.answerable) {
    const r = await withRetry(
      () => answerQuestion(PATIENT_ID, patient.name, c.question),
      c.id
    );
    const answerLower = r.answer.toLowerCase();
    const hits = c.expectKeywords.filter((k) =>
      answerLower.includes(k.toLowerCase())
    );
    const score = r.sources.length ? r.sources[0].score : await topScore(PATIENT_ID, c.question);
    const pass = !r.refused && hits.length === c.expectKeywords.length;
    results.answerable.push({
      id: c.id, question: c.question, pass,
      refused: r.refused, keywordHits: `${hits.length}/${c.expectKeywords.length}`,
      topScore: Number(score.toFixed(4)), answer: r.answer,
    });
    console.log(`[${c.id}] ${pass ? 'PASS' : 'FAIL'} score=${score.toFixed(3)} — ${r.answer.slice(0, 60)}…`);
    await sleep(DELAY_MS);
  }

  for (const c of cases.mustRefuse) {
    const r = await withRetry(
      () => answerQuestion(PATIENT_ID, patient.name, c.question),
      c.id
    );
    const score = await topScore(PATIENT_ID, c.question);
    const pass = r.refused === true;
    results.mustRefuse.push({
      id: c.id, question: c.question, pass,
      refused: r.refused, topScore: Number(score.toFixed(4)), answer: r.answer,
    });
    console.log(`[${c.id}] ${pass ? 'PASS' : 'FAIL'} score=${score.toFixed(3)} — ${r.answer.slice(0, 60)}…`);
    await sleep(DELAY_MS);
  }

  // ---- Summary ----
  const aPass = results.answerable.filter((r) => r.pass).length;
  const rPass = results.mustRefuse.filter((r) => r.pass).length;
  const aScores = results.answerable.map((r) => r.topScore);
  const rScores = results.mustRefuse.map((r) => r.topScore);
  const stats = (arr) =>
    arr.length
      ? { min: Math.min(...arr), max: Math.max(...arr), mean: Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(4)) }
      : null;

  const summary = {
    ranAt: new Date().toISOString(),
    model: process.env.GEMINI_CHAT_MODEL,
    answerRate: `${aPass}/${results.answerable.length}`,
    refusalRate: `${rPass}/${results.mustRefuse.length}`,
    answerableScores: stats(aScores),
    mustRefuseScores: stats(rScores),
  };

  console.log('\n===== SUMMARY =====');
  console.log(JSON.stringify(summary, null, 2));

  fs.writeFileSync(
    path.join(__dirname, `results-${Date.now()}.json`),
    JSON.stringify({ summary, results }, null, 2)
  );
  console.log('full results written to src/evals/');

  process.exit(0);
};

run();
