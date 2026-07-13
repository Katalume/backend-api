const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const validate = require('../utils/validator');
const { signupValidator, loginValidator } = require('../validators/auth.validator');
const { verifyToken } = require('../middleware/auth.middleware');

router.post('/signup', validate(signupValidator), authController.signup);
router.post('/login', validate(loginValidator), authController.login);
router.post('/refresh', authController.refresh);
router.get('/session', authController.session);
router.post('/logout', authController.logout);
router.post('/logout-all', verifyToken, authController.logoutAll);
router.put('/password', verifyToken, authController.changePassword);
router.get('/account', verifyToken, authController.exportAccount);
router.delete('/account', verifyToken, authController.deleteAccount);


module.exports = router;
