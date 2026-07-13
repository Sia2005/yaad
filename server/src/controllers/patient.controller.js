const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const FamilyMembership = require('../models/FamilyMembership');
const Consent = require('../models/Consent');

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
      new (require('mongoose').Types.ObjectId)(req.params.patientId)
    );
    return res.status(200).json(data);
  } catch (err) {
    console.error('getPatientPatterns failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

module.exports = { createPatient, getPatient, getPatientPatterns };