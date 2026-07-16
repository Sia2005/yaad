const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const {
  inviteMember,
  acceptInvite,
  listMembers,
  removeMember
} = require('../controllers/membership.controller');

const router = express.Router({ mergeParams: true });

router.post('/', requireAuth, requireRole('familyAdmin'), inviteMember);
router.post('/accept', requireAuth, acceptInvite);
router.get(
  '/',
  requireAuth,
  requireRole('familyAdmin', 'contributor', 'attendant', 'clinician'),
  listMembers
);

router.delete(
  '/:membershipId',
  requireAuth,
  requireRole('familyAdmin'),
  removeMember
);

module.exports = router;