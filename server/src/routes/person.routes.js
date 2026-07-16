const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const {
  createPerson,
  listPeople,
  getPersonPhoto,
  reviewPerson,
} = require('../controllers/person.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB — a face, not a RAW file
});

const router = express.Router({ mergeParams: true });

router.post(
  '/',
  requireAuth,
  requireRole('familyAdmin', 'contributor'),
  upload.single('photo'),
  createPerson
);

router.get(
  '/',
  requireAuth,
  requireRole('familyAdmin', 'contributor', 'attendant', 'clinician'),
  listPeople
);

router.get(
  '/:personId/photo',
  requireAuth,
  requireRole('familyAdmin', 'contributor', 'attendant', 'clinician'),
  getPersonPhoto
);

router.post(
  '/:personId/review',
  requireAuth,
  requireRole('familyAdmin'),
  reviewPerson
);

module.exports = router;