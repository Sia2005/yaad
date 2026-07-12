const GEMINI_EMBED_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent';

const embedText = async (text, taskType = 'RETRIEVAL_DOCUMENT') => {
  const res = await fetch(`${GEMINI_EMBED_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text }] },
      taskType,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`gemini embedding failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.embedding.values; // array of 768 numbers
};

module.exports = { embedText };