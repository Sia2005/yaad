const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const FamilyMembership = require('../models/FamilyMembership');
const Consent = require('../models/Consent');
const AuditLog = require('../models/AuditLog');
const { audit } = require('../services/audit.service');

// POST /api/patients — any authenticated user; creator becomes familyAdmin
const createPatient = async (req, res) => {
  try {
    const { name, dateOfBirth, preferredLanguage } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'patient name is required' });
    }

    const patient = await Patient.create({
      name,
      dateOfBirth,
      preferredLanguage,
      createdBy: req.userId,
    });

    await FamilyMembership.create({
      user: req.userId,
      patient: patient._id,
      role: 'familyAdmin',
    });

    await Consent.create({ patient: patient._id });

    audit(patient._id, req.userId, 'patient.created', patient._id.toString(), { name });

    return res.status(201).json({ patient });
  } catch (err) {
    console.error('createPatient failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// GET /api/patients/:patientId — any active member of that family
const getPatient = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.patientId)) {
      return res.status(404).json({ error: 'patient not found' });
    }

    const patient = await Patient.findById(req.params.patientId);
    if (!patient) {
      return res.status(404).json({ error: 'patient not found' });
    }
    return res.status(200).json({ patient, yourRole: req.membership.role });
  } catch (err) {
    console.error('getPatient failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// GET /api/patients/:patientId/patterns — caregiver + clinician analytics
const getPatientPatterns = async (req, res) => {
  try {
    const { getPatterns } = require('../services/patterns.service');
    const data = await getPatterns(
      new mongoose.Types.ObjectId(req.params.patientId)
    );
    return res.status(200).json(data);
  } catch (err) {
    console.error('getPatientPatterns failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// GET /api/patients/:patientId/audit — familyAdmin only
const getAuditLog = async (req, res) => {
  try {
    const entries = await AuditLog.find({ patient: req.params.patientId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('actor', 'name email');
    return res.status(200).json({ entries });
  } catch (err) {
    console.error('getAuditLog failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// POST /api/patients/:patientId/consent — familyAdmin manages consent state
const updateConsent = async (req, res) => {
  try {
    const { state, voiceCloningPermitted } = req.body;

    const allowed = ['active', 'delegated', 'frozen'];
    const update = {};
    if (state !== undefined) {
      if (!allowed.includes(state)) {
        return res
          .status(400)
          .json({ error: `state must be one of: ${allowed.join(', ')}` });
      }
      update.state = state;
    }
    if (voiceCloningPermitted !== undefined) {
      update.voiceCloningPermitted = !!voiceCloningPermitted;
    }

    const consent = await Consent.findOneAndUpdate(
      { patient: req.params.patientId },
      update,
      { new: true }
    );
    if (!consent) {
      return res.status(404).json({ error: 'consent record not found' });
    }

    audit(req.params.patientId, req.userId, 'consent.updated', consent._id.toString(), update);

    return res.status(200).json({ consent });
  } catch (err) {
    console.error('updateConsent failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

module.exports = {
  createPatient,
  getPatient,
  getPatientPatterns,
  getAuditLog,
  updateConsent,
};