const { GetObjectCommand } = require('@aws-sdk/client-s3');
const r2 = require('../config/r2');

const GROQ_TRANSCRIBE_URL =
  'https://api.groq.com/openai/v1/audio/transcriptions';

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const transcribeFromR2 = async (mediaKey) => {
  // 1. Fetch the audio back from R2
  const obj = await r2.send(
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: mediaKey })
  );
  const audioBuffer = await streamToBuffer(obj.Body);

  // 2. Build a multipart form, just like curl -F did to *our* API
  const form = new FormData();
  const filename = mediaKey.split('/').pop();
  form.append('file', new Blob([audioBuffer]), filename);
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'json');

  // 3. Send to Groq
  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`groq transcription failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.text;
};

module.exports = { transcribeFromR2 };