const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const {
  createPatient,
  getPatient,
  getPatientPatterns,
} = require('../controllers/patient.controller');
const { askQuestion, speakText } = require('../controllers/memory.controller');

const router = express.Router();

router.post('/', requireAuth, createPatient);

// ← NEW: the Mirror's question endpoint
router.post(
  '/:patientId/ask',
  requireAuth,
  requireRole('familyAdmin', 'contributor', 'attendant'),
  askQuestion
);

router.get(
  '/:patientId',
  requireAuth,
  requireRole('familyAdmin', 'contributor', 'attendant', 'clinician'),
  getPatient
);

router.post(
  '/:patientId/speak',
  requireAuth,
  requireRole('familyAdmin', 'contributor', 'attendant'),
  speakText
);

router.get(
  '/:patientId/patterns',
  requireAuth,
  requireRole('familyAdmin', 'contributor', 'clinician'),
  getPatientPatterns
);

const membershipRoutes = require('./membership.routes');
router.use('/:patientId/members', membershipRoutes);

const memoryRoutes = require('./memory.routes');
router.use('/:patientId/memories', memoryRoutes);

module.exports = router;