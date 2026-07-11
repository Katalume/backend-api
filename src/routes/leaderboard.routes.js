const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboard.controller');

router.get('/', leaderboardController.getGlobalLeaderboard);

module.exports = router;
