const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.get('/me', verifyToken, profileController.getMyProfile);

module.exports = router;
