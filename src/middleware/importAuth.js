const crypto = require('crypto');
const { PROBLEMS_IMPORT_TOKEN } = require('../config/env');

/**
 * Service-token auth for the content-import pipeline (ml-problems CI).
 * This is machine-to-machine auth — no user, no cookies. The endpoint is
 * disabled entirely (503) until PROBLEMS_IMPORT_TOKEN is configured.
 */
module.exports = function importAuth(req, res, next) {
    if (!PROBLEMS_IMPORT_TOKEN) {
        return res.status(503).json({ message: 'Problem import is not enabled on this server' });
    }
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const expected = Buffer.from(PROBLEMS_IMPORT_TOKEN);
    const provided = Buffer.from(token);
    const valid = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
    if (!valid) {
        return res.status(401).json({ message: 'Invalid import token' });
    }
    return next();
};
