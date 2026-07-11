const mongoose = require('mongoose');
const User = require('../models/User');
const FamilyMembership = require('../models/FamilyMembership');

// POST /api/patients/:patientId/members — familyAdmin only
const inviteMember = async (req, res) => {
  try {
    const { email, role } = req.body;
    const { patientId } = req.params;

    if (!email || !role) {
      return res.status(400).json({ error: 'email and role are required' });
    }
    if (!FamilyMembership.ROLES.includes(role)) {
      return res.status(400).json({
        error: `role must be one of: ${FamilyMembership.ROLES.join(', ')}`,
      });
    }

    const invitee = await User.findOne({ email: email.toLowerCase() });
    if (!invitee) {
      return res.status(404).json({
        error: 'no account found for this email — ask them to register first',
      });
    }

    if (invitee._id.equals(req.userId)) {
      return res.status(400).json({ error: 'you cannot invite yourself' });
    }

    const membership = await FamilyMembership.create({
      user: invitee._id,
      patient: patientId,
      role,
      status: 'invited',
      invitedBy: req.userId,
    });

    return res.status(201).json({
      membership: {
        id: membership._id,
        user: { id: invitee._id, name: invitee.name, email: invitee.email },
        role: membership.role,
        status: membership.status,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ error: 'this user already has a membership for this patient' });
    }
    console.error('inviteMember failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// POST /api/patients/:patientId/members/accept — the invitee themselves
const acceptInvite = async (req, res) => {
  try {
    const { patientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(404).json({ error: 'invite not found' });
    }

    const membership = await FamilyMembership.findOneAndUpdate(
      { user: req.userId, patient: patientId, status: 'invited' },
      { status: 'active' },
      { new: true }
    );

    if (!membership) {
      return res.status(404).json({ error: 'invite not found' });
    }

    return res.status(200).json({
      membership: { id: membership._id, role: membership.role, status: membership.status },
    });
  } catch (err) {
    console.error('acceptInvite failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

// GET /api/patients/:patientId/members — any active member
const listMembers = async (req, res) => {
  try {
    const members = await FamilyMembership.find({
      patient: req.params.patientId,
      status: { $ne: 'removed' },
    }).populate('user', 'name email');

    return res.status(200).json({ members });
  } catch (err) {
    console.error('listMembers failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

module.exports = { inviteMember, acceptInvite, listMembers };