const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken, authorizeRoles } = require('../middleware/auth.middleware');
const userController = require('../controllers/user.controller');

router.get('/me', verifyToken, authController.me);
router.get('/me/stats', verifyToken, userController.getMyStats);

router.get('/', verifyToken, authorizeRoles('Admin'), userController.getAllUsers);
router.get('/:id', verifyToken, userController.getUserById);
router.put('/:id', verifyToken, userController.updateUser);
router.delete('/:id', verifyToken, authorizeRoles('Admin'), userController.deleteUser);

module.exports = router;
