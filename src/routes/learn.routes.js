const express = require('express');
const router = express.Router();
const learnController = require('../controllers/learn.controller');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');
const { auditAction } = require('../middleware/audit');

router.get('/tracks', learnController.getTracks);
router.post('/tracks', verifyToken, authorizeRoles('Admin'), auditAction('track.create', 'LearningTrack'), learnController.createTrack);
router.put('/tracks/:id', verifyToken, authorizeRoles('Admin'), auditAction('track.update', 'LearningTrack'), learnController.updateTrack);
router.delete('/tracks/:id', verifyToken, authorizeRoles('Admin'), auditAction('track.delete', 'LearningTrack'), learnController.deleteTrack);

module.exports = router;
