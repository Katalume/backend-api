const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { client } = require('../config/redis');
const { REDIS_URL } = require('../config/env');

const message = (msg) => ({ status: 429, message: msg });
const skip = () => process.env.NODE_ENV === 'test';

function store(prefix) {
    if (!REDIS_URL) return undefined;
    return new RedisStore({
        prefix: `mlboost:${prefix}:`,
        sendCommand: (...args) => client.sendCommand(args),
    });
}

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip,
    store: store('api'),
    message: message('Too many requests, please try again later.'),
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip,
    store: store('auth'),
    message: message('Too many authentication attempts, please try again later.'),
});

const executionLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip,
    store: store('execution'),
    keyGenerator: (req) => req.user.id,
    message: message('Too many code executions, please slow down.'),
});

module.exports = { apiLimiter, authLimiter, executionLimiter };
