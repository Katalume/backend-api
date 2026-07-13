const express = require('express');
const router = express.Router();
const contestController = require('../controllers/contest.controller');
const { verifyToken, authorizeRoles, optionalAuth } = require('../middleware/auth.middleware');
const { auditAction } = require('../middleware/audit');

router.get('/', contestController.getAllContests);
router.get('/:id/leaderboard', contestController.getContestLeaderboard);
router.get('/:id', optionalAuth, contestController.getContestById);

router.post('/', verifyToken, authorizeRoles('Admin'), auditAction('contest.create', 'Contest'), contestController.createContest);
router.put('/:id', verifyToken, authorizeRoles('Admin'), auditAction('contest.update', 'Contest'), contestController.updateContest);
router.delete('/:id', verifyToken, authorizeRoles('Admin'), auditAction('contest.delete', 'Contest'), contestController.deleteContest);

router.post('/:id/register', verifyToken, contestController.registerForContest);

module.exports = router;
