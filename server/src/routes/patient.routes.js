const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const {
  createPatient,
  getPatient,
} = require('../controllers/patient.controller');

const router = express.Router();

router.post('/', requireAuth, createPatient);
router.get(
  '/:patientId',
  requireAuth,
  requireRole('familyAdmin', 'contributor', 'attendant', 'clinician'),
  getPatient
);

module.exports = router;