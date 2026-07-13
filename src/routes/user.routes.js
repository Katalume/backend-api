const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');
const userController = require('../controllers/user.controller');
const { auditAction } = require('../middleware/audit');

router.get('/me', verifyToken, authController.me);
router.get('/me/stats', verifyToken, userController.getMyStats);
router.get('/me/progress', verifyToken, userController.getMyProgress);

router.get('/', verifyToken, authorizeRoles('Admin'), userController.getAllUsers);
router.get('/:id', verifyToken, userController.getUserById);
router.put('/:id', verifyToken, auditAction('user.update', 'User'), userController.updateUser);
router.delete('/:id', verifyToken, authorizeRoles('Admin'), auditAction('user.delete', 'User'), userController.deleteUser);

module.exports = router;
