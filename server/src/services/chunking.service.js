const CHUNK_SIZE = 200; // words
const OVERLAP = 40;     // words

const chunkText = (text) => {
  const words = text.trim().split(/\s+/);
  if (words.length === 0 || (words.length === 1 && words[0] === '')) return [];

  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + CHUNK_SIZE, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end === words.length) break;
    start = end - OVERLAP;
  }

  return chunks;
};

module.exports = { chunkText };