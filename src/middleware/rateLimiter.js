const rateLimit = require('express-rate-limit');

const message = (msg) => ({ status: 429, message: msg });

// Disable throttling under test so suites aren't rate-limited.
const skip = () => process.env.NODE_ENV === 'test';

// General API limiter — applied to all /api routes.
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    message: message('Too many requests, please try again later.'),
});

// Strict limiter for authentication endpoints (brute-force protection).
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    message: message('Too many authentication attempts, please try again later.'),
});

// Limiter for the untrusted-code execution endpoints (run/submit).
const executionLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    message: message('Too many code executions, please slow down.'),
});

module.exports = { apiLimiter, authLimiter, executionLimiter };
