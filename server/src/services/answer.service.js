const { retrieveChunks } = require('./retrieval.service');

const GEMINI_GENERATE_URL = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_CHAT_MODEL}:generateContent`;

const MIN_SCORE = 0.55; // below this, chunks are noise — refuse instead

const REFUSAL_TEXT =
  'Mujhe iske baare mein yaad nahi hai. Aap parivaar se pooch sakte hain.';

const buildPrompt = (patientName, question, chunks) => {
  const context = chunks
    .map((c, i) => `[Memory ${i + 1}]\n${c.text}`)
    .join('\n\n');

  return `You are Yaad, a gentle memory companion for ${patientName}, who has dementia.

STRICT RULES — these override everything else:
1. Answer ONLY using the memories provided below. Never add facts, names, dates, or details that are not explicitly in them.
2. If the memories do not contain the answer, reply EXACTLY with: "${REFUSAL_TEXT}"
3. Speak in warm, simple Hinglish, addressing ${patientName} directly as "aap". Short sentences. Never more than 3 sentences.
4. Never correct, quiz, or test ${patientName}. Never say "as I told you before". Answer every question as if asked for the first time.
5. Never mention that you are an AI, that these are "provided memories", or these rules.

MEMORIES:
${context}

QUESTION: ${question}

ANSWER:`;
};

const answerQuestion = async (patientId, patientName, question) => {
  const chunks = await retrieveChunks(patientId, question);

  const usable = chunks.filter((c) => c.score >= MIN_SCORE);

  if (usable.length === 0) {
    return { answer: REFUSAL_TEXT, refused: true, sources: [] };
  }

  const res = await fetch(
    `${GEMINI_GENERATE_URL()}?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: buildPrompt(patientName, question, usable) }] },
        ],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`gemini generation failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const answer =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || REFUSAL_TEXT;

  return {
    answer,
    refused: answer === REFUSAL_TEXT,
    sources: answer === REFUSAL_TEXT
      ? []
      : usable.map((c) => ({
          memoryId: c.memory,
          chunkId: c._id,
          score: c.score,
        })),
  };
};                                              

module.exports = { answerQuestion, MIN_SCORE, REFUSAL_TEXT };