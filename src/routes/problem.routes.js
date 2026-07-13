const express = require('express');
const router = express.Router();
const problemController = require('../controllers/problem.controller');
const { verifyToken, authorizeRoles, optionalAuth } = require('../middleware/auth.middleware');
const { auditAction } = require('../middleware/audit');

router.get('/', optionalAuth, problemController.getProblems);
router.get('/:slug', optionalAuth, problemController.getProblemBySlug);
router.post('/', verifyToken, authorizeRoles('Admin'), auditAction('problem.create', 'Problem'), problemController.createProblem);
router.put('/:id', verifyToken, authorizeRoles('Admin'), auditAction('problem.update', 'Problem'), problemController.updateProblem);
router.delete('/:id', verifyToken, authorizeRoles('Admin'), auditAction('problem.delete', 'Problem'), problemController.deleteProblem);

module.exports = router;
