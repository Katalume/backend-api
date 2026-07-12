const express = require('express');
const router = express.Router();
const learnController = require('../controllers/learn.controller');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');

router.get('/tracks', learnController.getTracks);
router.post('/tracks', verifyToken, authorizeRoles('Admin'), learnController.createTrack);
router.put('/tracks/:id', verifyToken, authorizeRoles('Admin'), learnController.updateTrack);
router.delete('/tracks/:id', verifyToken, authorizeRoles('Admin'), learnController.deleteTrack);

module.exports = router;
