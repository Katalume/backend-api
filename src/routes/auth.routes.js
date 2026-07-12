const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const validate = require('../utils/validator');
const { signupValidator, loginValidator } = require('../validators/auth.validator');

router.post('/signup', validate(signupValidator), authController.signup);
router.post('/login', validate(loginValidator), authController.login);
router.post('/refresh', authController.refresh);
router.get('/session', authController.session);
router.post('/logout', authController.logout);


module.exports = router;
