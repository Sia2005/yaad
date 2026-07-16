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

// GET /api/patients — patients I can access (active) + invites awaiting me (pending)
const listMyPatients = async (req, res) => {
  try {
    const memberships = await FamilyMembership.find({
      user: req.userId,
      status: { $in: ['active', 'invited'] },
    }).populate('patient', 'name preferredLanguage stage');

    const patients = memberships
      .filter((m) => m.patient)
      .map((m) => ({
        id: m.patient._id,
        name: m.patient.name,
        preferredLanguage: m.patient.preferredLanguage,
        stage: m.patient.stage,
        role: m.role,
        pending: m.status === 'invited', // true = needs accepting
      }));

    return res.status(200).json({ patients });
  } catch (err) {
    console.error('listMyPatients failed:', err);
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

const getPatientPatterns = async (req, res) => {
  try {
    const { getPatterns } = require('../services/patterns.service');

    // Load her first — we need her timezone. Time-of-day patterns are only
    // meaningful in the patient's own local time, never the server's.
    const patient = await Patient.findById(req.params.patientId);
    if (!patient) return res.status(404).json({ error: 'patient not found' });

    // patient._id is already an ObjectId — no casting needed.
    const data = await getPatterns(patient._id, patient.timezone);

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

// GET /api/patients/:patientId/dashboard — one bundle for the caregiver dashboard
const getDashboard = async (req, res) => {
  try {
    const Memory = require('../models/Memory');
    const Consent = require('../models/Consent');
    const DailyNote = require('../models/DailyNote');
    const { getPatterns } = require('../services/patterns.service');
    const patientId = req.params.patientId;

    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ error: 'patient not found' });

    const [approvedCount, pending, members, consent, dailyNotes, patterns] =
      await Promise.all([
        Memory.countDocuments({ patient: patientId, status: 'approved' }),
        Memory.find({ patient: patientId, status: 'pending' })
          .sort({ createdAt: -1 })
          .populate('uploadedBy', 'name'),
        FamilyMembership.find({ patient: patientId, status: { $ne: 'removed' } })
          .populate('user', 'name email'),
        Consent.findOne({ patient: patientId }),
        DailyNote.find({ patient: patientId })
          .sort({ createdAt: -1 })
          .populate('author', 'name'),
        getPatterns(new (require('mongoose').Types.ObjectId)(patientId), patient.timezone),
      ]);

    return res.status(200).json({
      patient: { id: patient._id, name: patient.name, stage: patient.stage },
      yourRole: req.membership.role,
      approvedCount,
      pending: pending.map((m) => ({
        id: m._id,
        title: m.title,
        uploadedBy: m.uploadedBy?.name || 'Someone',
        createdAt: m.createdAt,
        excerpt: m.transcript ? m.transcript.slice(0, 140) : '',
      })),
      members: members.map((m) => ({
        id: m._id,
        name: m.user?.name,
        email: m.user?.email,
        role: m.role,
        status: m.status,
      })),
      consent: consent
        ? { state: consent.state, voiceCloningPermitted: consent.voiceCloningPermitted }
        : null,
      dailyNotes: dailyNotes.map((n) => ({
        id: n._id,
        text: n.text,
        author: n.author?.name || 'Someone',
        createdAt: n.createdAt,
        expiresAt: n.expiresAt,
      })),
      insights: patterns.alerts || [],
      totalInteractions: patterns.totalInteractions || 0,
    });
  } catch (err) {
    console.error('getDashboard failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

module.exports = {
  createPatient,
  listMyPatients,
  getPatient,
  getPatientPatterns,
  getAuditLog,
  updateConsent,
  getDashboard
};