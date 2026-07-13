const express = require('express');
const router = express.Router();
const runnerController = require('../controllers/runner.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { executionLimiter } = require('../middleware/rateLimiter');

// Run code with custom input (no database save)
router.post('/run', authMiddleware.verifyToken, executionLimiter, runnerController.runCode);
router.get('/jobs/:id', authMiddleware.verifyToken, runnerController.getRun);

module.exports = router;
