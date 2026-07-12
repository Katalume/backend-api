const { body } = require('express-validator');

// Ensuring these fields are strings prevents NoSQL-injection payloads
// like { "email": { "$gt": "" } } from reaching Mongoose queries.
const signupValidator = [
    // username and name are both optional; the controller derives a unique
    // username from whichever is present (or the email local part).
    body('username').optional().isString().trim().isLength({ min: 3, max: 32 }),
    body('name').optional().isString().trim().isLength({ min: 1, max: 64 }),
    body('email').isString().trim().isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 8, max: 128 }),
    body('role').optional().isString().isIn(['User', 'Organization']),
];

const loginValidator = [
    body('email').isString().trim().notEmpty(),
    body('password').isString().notEmpty(),
];

module.exports = { signupValidator, loginValidator };
