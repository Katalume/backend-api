const express = require('express');
const router = express.Router();
const problemController = require('../controllers/problem.controller');
const { verifyToken, authorizeRoles, optionalAuth } = require('../middleware/auth.middleware');

router.get('/', optionalAuth, problemController.getProblems);
router.get('/:slug', problemController.getProblemBySlug);
router.post('/', verifyToken, authorizeRoles('Admin'), problemController.createProblem);

module.exports = router;
