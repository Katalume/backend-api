const express = require('express');
const router = express.Router();
const contestController = require('../controllers/contest.controller');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');

router.get('/', contestController.getAllContests);
router.get('/:id/leaderboard', contestController.getContestLeaderboard);
router.get('/:id', contestController.getContestById);

router.post('/', verifyToken, authorizeRoles('Admin'), contestController.createContest);
router.put('/:id', verifyToken, authorizeRoles('Admin'), contestController.updateContest);
router.delete('/:id', verifyToken, authorizeRoles('Admin'), contestController.deleteContest);

router.post('/:id/register', verifyToken, contestController.registerForContest);

module.exports = router;
