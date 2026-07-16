const mongoose = require('mongoose');
const Person = require('../models/Person');
const { uploadPhoto, getObject } = require('../services/storage.service');
const { audit } = require('../services/audit.service');

// POST /api/patients/:patientId/people — familyAdmin or contributor
const createPerson = async (req, res) => {
  try {
    const { name, relationship, story } = req.body;
    const { patientId } = req.params;

    if (!name || !relationship) {
      return res.status(400).json({ error: 'name and relationship are required' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'a photo is required — a face is the whole point' });
    }

    const photoKey = await uploadPhoto(patientId, req.file.buffer, req.file.mimetype);

    const person = await Person.create({
      patient: patientId,
      name: name.trim(),
      relationship: relationship.trim(),
      story: story?.trim(),
      photoKey,
      addedBy: req.userId,
      status: 'pending',
    });

    audit(patientId, req.userId, 'person.added', person._id, {
      name: person.name,
      relationship: person.relationship,
    });

    return res.status(201).json({
      person: {
        id: person._id,
        name: person.name,
        relationship: person.relationship,
        story: person.story,
        status: person.status,
      },
    });
  } catch (err) {
    if (/unsupported image type/.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    console.error('createPerson failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// GET /api/patients/:patientId/people
// ?status=pending gives the review queue (admins only, enforced by the route)
const listPeople = async (req, res) => {
  try {
    const filter = { patient: req.params.patientId };

    // The Mirror asks for approved only. Anything unapproved must never reach
    // her — an unreviewed card is an unverified claim about who someone is.
    filter.status = req.query.status === 'pending' ? 'pending' : 'approved';

    const people = await Person.find(filter)
      .sort({ createdAt: 1 })
      .populate('addedBy', 'name');

    return res.status(200).json({
      people: people.map((p) => ({
        id: p._id,
        name: p.name,
        relationship: p.relationship,
        story: p.story,
        status: p.status,
        addedBy: p.addedBy?.name || 'Someone',
        hasPhoto: !!p.photoKey,
      })),
    });
  } catch (err) {
    console.error('listPeople failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// GET /api/patients/:patientId/people/:personId/photo
const getPersonPhoto = async (req, res) => {
  try {
    const { patientId, personId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(personId)) {
      return res.status(404).json({ error: 'person not found' });
    }

    // Scoped by patient, not just _id — same IDOR guard as removeMember.
    const person = await Person.findOne({ _id: personId, patient: patientId });
    if (!person || !person.photoKey) {
      return res.status(404).json({ error: 'person not found' });
    }

    const { buffer, contentType } = await getObject(person.photoKey);

    res.set('Content-Type', contentType || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=3600');
    return res.send(buffer);
  } catch (err) {
    console.error('getPersonPhoto failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// POST /api/patients/:patientId/people/:personId/review — familyAdmin only
const reviewPerson = async (req, res) => {
  try {
    const { patientId, personId } = req.params;
    const { decision } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
    }
    if (!mongoose.Types.ObjectId.isValid(personId)) {
      return res.status(404).json({ error: 'person not found' });
    }

    const person = await Person.findOne({ _id: personId, patient: patientId });
    if (!person || person.status !== 'pending') {
      return res.status(404).json({ error: 'person not found' });
    }

    person.status = decision;
    if (decision === 'approved') person.approvedBy = req.userId;

    try {
      await person.save();
    } catch (e) {
      // The schema hook fires here when someone tries to approve their own card
      if (/approved by someone other/.test(e.message)) {
        return res.status(403).json({
          error: 'you cannot approve a person card you added yourself',
        });
      }
      throw e;
    }

    audit(patientId, req.userId, `person.${decision}`, person._id, {
      name: person.name,
    });

    return res.status(200).json({
      person: { id: person._id, name: person.name, status: person.status },
    });
  } catch (err) {
    console.error('reviewPerson failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

module.exports = { createPerson, listPeople, getPersonPhoto, reviewPerson };