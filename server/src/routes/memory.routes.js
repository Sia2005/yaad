const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const {
  createAudioMemory,
  getMemory,
  listMemories,
  reviewMemory,
  searchMemories,
} = require('../controllers/memory.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

const router = express.Router({ mergeParams: true });

router.post(
  '/',
  requireAuth,
  requireRole('familyAdmin', 'contributor'),
  upload.single('audio'),
  createAudioMemory
);

router.get(
  '/search',
  requireAuth,
  requireRole('familyAdmin', 'contributor'),
  searchMemories
);

router.get(
  '/:memoryId',
  requireAuth,
  requireRole('familyAdmin', 'contributor', 'attendant', 'clinician'),
  getMemory
);

router.get(
  '/',
  requireAuth,
  requireRole('familyAdmin', 'contributor', 'attendant', 'clinician'),
  listMemories
);

router.post(
  '/:memoryId/review',
  requireAuth,
  requireRole('familyAdmin'),
  reviewMemory
);


module.exports = router;