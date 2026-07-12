const crypto = require('crypto');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const r2 = require('../config/r2');

const TTS_URL = () =>
  `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_TTS_MODEL}:generateContent`;

// Gemini TTS returns raw PCM (24kHz, 16-bit, mono) — browsers need a WAV header
const pcmToWav = (pcm) => {
  const sampleRate = 24000, channels = 1, bitDepth = 16;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bitDepth / 8, 28);
  header.writeUInt16LE(channels * bitDepth / 8, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
};

const speak = async (patientId, text) => {
  const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);
  const key = `patients/${patientId}/tts/${hash}.wav`;

  // 1. Cache hit? Serve from R2, zero API cost
  try {
    const cached = await r2.send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key })
    );
    return { audio: await streamToBuffer(cached.Body), cached: true };
  } catch {
    // miss — fall through to generate
  }

  // 2. Generate via Gemini TTS
  const res = await fetch(`${TTS_URL()}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`gemini tts failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const b64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error('gemini tts returned no audio');

  const wav = pcmToWav(Buffer.from(b64, 'base64'));

  // 3. Cache for next time (failure here shouldn't break playback)
  try {
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET, Key: key,
      Body: wav, ContentType: 'audio/wav',
    }));
  } catch (e) {
    console.error('tts cache write failed:', e.message);
  }

  return { audio: wav, cached: false };
};

module.exports = { speak };