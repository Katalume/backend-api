const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submission.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { executionLimiter } = require('../middleware/rateLimiter');

router.post('/', authMiddleware.verifyToken, executionLimiter, submissionController.submitCode);
router.get('/', authMiddleware.verifyToken, submissionController.getSubmissions);
router.get('/:id', authMiddleware.verifyToken, submissionController.getSubmission);
router.delete('/:id', authMiddleware.verifyToken, submissionController.cancelSubmission);

module.exports = router;
