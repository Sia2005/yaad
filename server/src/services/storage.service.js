const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const r2 = require('../config/r2');

const uploadAudio = async (patientId, buffer, mimetype) => {
  const ext = mimetype === 'audio/mpeg' ? 'mp3' : 'webm';
  const key = `patients/${patientId}/audio/${uuidv4()}.${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    })
  );

  return key;
};

const PHOTO_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

const uploadPhoto = async (patientId, buffer, mimetype) => {
  const ext = PHOTO_EXT[mimetype];
  if (!ext) {
    throw new Error(`unsupported image type: ${mimetype}`);
  }
  const key = `patients/${patientId}/photos/${uuidv4()}.${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    })
  );

  return key;
};

// Read an object back as a Buffer. The bucket is private — nothing in R2 is
// ever served directly to a browser. Every read goes through the API so it
// passes requireAuth and requireRole first.
const getObject = async (key) => {
  const res = await r2.send(
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key })
  );
  const bytes = await res.Body.transformToByteArray();
  return { buffer: Buffer.from(bytes), contentType: res.ContentType };
};

module.exports = { uploadAudio, uploadPhoto, getObject };