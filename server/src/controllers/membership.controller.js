const mongoose = require('mongoose');
const User = require('../models/User');
const FamilyMembership = require('../models/FamilyMembership');
const { audit } = require('../services/audit.service');

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

    // The (user, patient) compound index is unique, so a REMOVED member can
    // never be invited again — create() would throw 11000. Revive the existing
    // row instead. This keeps one durable record per person per patient, which
    // is what makes the audit trail readable: "invited, removed, re-invited"
    // rather than three disconnected rows.
    const existing = await FamilyMembership.findOne({
      user: invitee._id,
      patient: patientId,
    });

    if (existing) {
      if (existing.status !== 'removed') {
        return res
          .status(409)
          .json({ error: 'this user already has a membership for this patient' });
      }
      existing.role = role;
      existing.status = 'invited';
      existing.invitedBy = req.userId;
      await existing.save();

      audit(patientId, req.userId, 'member.reinvited', invitee._id, { role });

      return res.status(201).json({
        membership: {
          id: existing._id,
          user: { id: invitee._id, name: invitee.name, email: invitee.email },
          role: existing.role,
          status: existing.status,
        },
      });
    }

    const membership = await FamilyMembership.create({
      user: invitee._id,
      patient: patientId,
      role,
      status: 'invited',
      invitedBy: req.userId,
    });

    audit(patientId, req.userId, 'member.invited', invitee._id, { role });

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

    audit(patientId, req.userId, 'member.accepted', req.userId, {
      role: membership.role,
    });

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

// DELETE /api/patients/:patientId/members/:membershipId — familyAdmin only
const removeMember = async (req, res) => {
  try {
    const { patientId, membershipId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(membershipId)) {
      return res.status(404).json({ error: 'membership not found' });
    }

    // Scope the lookup by patient, NOT just by _id. findById(membershipId)
    // would let an admin of patient A remove a membership belonging to
    // patient B simply by knowing its id — the classic IDOR. Look up only
    // within the resource you already hold permission on.
    const membership = await FamilyMembership.findOne({
      _id: membershipId,
      patient: patientId,
    }).populate('user', 'name email');

    if (!membership || membership.status === 'removed') {
      return res.status(404).json({ error: 'membership not found' });
    }

    // You cannot remove yourself. An admin who does is locked out of their own
    // patient with no way back in. Leaving is a different operation with
    // different UX; it isn't this one.
    if (membership.user._id.equals(req.userId)) {
      return res.status(400).json({
        error: 'you cannot remove yourself — ask another family admin',
      });
    }

    // You cannot remove the last active family admin. Roles are per-patient,
    // so losing the final admin means nobody can ever approve a memory, invite
    // anyone, or change consent for this patient again. The data would be
    // permanently stranded.
    if (membership.role === 'familyAdmin' && membership.status === 'active') {
      const activeAdmins = await FamilyMembership.countDocuments({
        patient: patientId,
        role: 'familyAdmin',
        status: 'active',
      });
      if (activeAdmins <= 1) {
        return res.status(409).json({
          error:
            'cannot remove the last family admin — promote someone else first',
        });
      }
    }

    // Soft delete. "Who had access to her memories in March?" is a question a
    // dementia-care app must always be able to answer, and hard-deleting the
    // row destroys that permanently. The member's approved memories and their
    // name on them stay too — history is not tidied away.
    const previousStatus = membership.status;
    membership.status = 'removed';
    await membership.save();

    audit(patientId, req.userId, 'member.removed', membership.user._id, {
      role: membership.role,
      previousStatus,
      email: membership.user.email,
    });

    return res.status(200).json({
      removed: {
        id: membership._id,
        user: { id: membership.user._id, name: membership.user.name },
        role: membership.role,
      },
    });
  } catch (err) {
    console.error('removeMember failed:', err);
    return res.status(500).json({ error: 'something went wrong' });
  }
};

module.exports = { inviteMember, acceptInvite, listMembers, removeMember };