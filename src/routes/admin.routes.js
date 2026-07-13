const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');

router.get('/stats', verifyToken, authorizeRoles('Admin'), adminController.getStats);
router.get('/audit', verifyToken, authorizeRoles('Admin'), adminController.getAuditEvents);

module.exports = router;
