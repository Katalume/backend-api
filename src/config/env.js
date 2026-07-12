const path = require('path');

// Load .env from the repository root regardless of the process working directory.
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

/**
 * Read a required secret. In production a missing value is fatal (fail fast)
 * so we never silently fall back to a well-known, guessable secret.
 */
function requiredSecret(name, devFallback) {
    const value = process.env[name];
    if (value && value.length > 0) return value;
    if (isProd) {
        // eslint-disable-next-line no-console
        console.error(`FATAL: required environment variable ${name} is not set`);
        process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.warn(`[env] ${name} not set — using insecure development fallback. DO NOT use in production.`);
    return devFallback;
}

function parseIntList(value, fallback) {
    return (value || fallback)
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n));
}

module.exports = {
    NODE_ENV,
    BACKEND_PORT: process.env.BACKEND_PORT || 5001,
    MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/leetcode-clone',
    JWT_ACCESS_SECRET: requiredSecret('JWT_ACCESS_SECRET', 'dev_only_access_secret'),
    JWT_REFRESH_SECRET: requiredSecret('JWT_REFRESH_SECRET', 'dev_only_refresh_secret'),
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '',
    COOKIE_SAME_SITE: ['strict', 'lax', 'none'].includes((process.env.COOKIE_SAME_SITE || '').toLowerCase())
        ? process.env.COOKIE_SAME_SITE.toLowerCase()
        : 'strict',
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: process.env.REDIS_PORT || 6379,
    JUDGE0_URL: process.env.JUDGE0_URL || 'http://localhost:2358',
    JUDGE0_AUTH_TOKEN: process.env.JUDGE0_AUTH_TOKEN || '',
    // Allowed CORS origins (comma-separated in the env var).
    CORS_ORIGIN: (process.env.CORS_ORIGIN || 'http://localhost:5173')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    // Judge0 language IDs permitted for execution (default: common languages).
    ALLOWED_LANGUAGE_IDS: parseIntList(process.env.ALLOWED_LANGUAGE_IDS, '50,51,54,60,62,63,68,71,72,73,74'),
    // Maximum accepted source-code size in bytes.
    MAX_CODE_SIZE: parseInt(process.env.MAX_CODE_SIZE || '65536', 10),
};
