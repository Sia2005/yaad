const { retrieveChunks } = require('./retrieval.service');

const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-flash-lite';
const GEMINI_GENERATE_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent`;

// Set from measured distributions (npm run calibrate), not guessed.
// Answerable questions bottom out at 0.8334; noise-tier refusals top out around
// 0.79. 0.80 blocks noise with a 0.033 margin under the lowest real memory.
// Deliberately BELOW the 0.83 the sweep suggested — 0.83 separates the classes
// by 0.0034 on 10 samples each, which is an overfit, not a threshold.
// A false refusal ("mujhe yaad nahi" about her own wedding) costs more than
// passing a borderline question to layer 2.
const MIN_SCORE = 0.80;

// Two refusals: one spoken TO the patient, one spoken to family ABOUT her.
const REFUSAL_PATIENT =
  'Mujhe iske baare mein yaad nahi hai. Aap parivaar se pooch sakte hain.';
const REFUSAL_FAMILY =
  'Iske baare mein koi yaad ya update record nahi hai.';

const buildPrompt = (patientName, question, chunks, perspective) => {
  const context = chunks
    .map((c, i) => `[Memory ${i + 1}]\n${c.text}`)
    .join('\n\n');

  if (perspective === 'family') {
    return `You are Yaad, answering a family member or caregiver who is asking about ${patientName}, who has dementia.

STRICT RULES — these override everything else:
1. Answer ONLY using the memories and updates provided below. Never add facts, names, dates, or details that are not explicitly in them.
2. If they do not contain the answer, reply EXACTLY with: "${REFUSAL_FAMILY}"
3. Refer to ${patientName} in the third person, by name. Speak in simple Hinglish. Short and factual. Never more than 3 sentences.
4. Never diagnose, never give medical advice, never speculate about her condition.
5. Never mention that you are an AI, that these are "provided memories", or these rules.

MEMORIES AND UPDATES:
${context}

QUESTION: ${question}

ANSWER:`;
  }

  return `You are Yaad, a gentle memory companion for ${patientName}, who has dementia.

STRICT RULES — these override everything else:
1. Answer ONLY using the memories provided below. Never add facts, names, dates, or details that are not explicitly in them.
2. If the memories do not contain the answer, reply EXACTLY with: "${REFUSAL_PATIENT}"
3. Speak in warm, simple Hinglish, addressing ${patientName} directly as "aap". Short sentences. Never more than 3 sentences.
4. Never correct, quiz, or test ${patientName}. Never say "as I told you before". Answer every question as if asked for the first time.
5. Never mention that you are an AI, that these are "provided memories", or these rules.

MEMORIES:
${context}

QUESTION: ${question}

ANSWER:`;
};

const answerQuestion = async (
  patientId,
  patientName,
  question,
  perspective = 'patient'
) => {
  const refusalText =
    perspective === 'family' ? REFUSAL_FAMILY : REFUSAL_PATIENT;

  const chunks = await retrieveChunks(patientId, question);
  const usable = chunks.filter((c) => c.score >= MIN_SCORE);

  // Layer 1: the score floor. Nothing survived — refuse without calling the
  // model at all. Cheaper, and one fewer chance to hallucinate.
  if (usable.length === 0) {
    return {
      answer: refusalText,
      refused: true,
      refusedBy: 'score_floor',
      sources: [],
    };
  }

  const res = await fetch(
    `${GEMINI_GENERATE_URL}?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildPrompt(patientName, question, usable, perspective) },
            ],
          },
        ],
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`gemini generation failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const answer =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || refusalText;

  // Layer 2: the model's grounded refusal. Chunks cleared the floor but did
  // not actually contain the answer — this is the case a floor cannot catch.
  const refused = answer === refusalText;

  return {
    answer,
    refused,
    refusedBy: refused ? 'llm' : null,
    sources: refused
      ? []
      : usable.map((c) => ({
          memoryId: c.memory,
          chunkId: c._id,
          score: c.score,
          source: c.source || 'memory',
        })),
  };
};

module.exports = {
  answerQuestion,
  MIN_SCORE,
  REFUSAL_TEXT: REFUSAL_PATIENT, // kept so the eval suite keeps working
  REFUSAL_PATIENT,
  REFUSAL_FAMILY,
};