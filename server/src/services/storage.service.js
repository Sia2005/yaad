const { PutObjectCommand } = require('@aws-sdk/client-s3');
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

module.exports = { uploadAudio };