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

function positiveInt(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
    const raw = process.env[name] || String(fallback);
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return parsed;
}

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

if (isProd && (
    !process.env.MONGO_URI
    || !process.env.REDIS_URL
    || !process.env.CORS_ORIGIN
    || !process.env.JUDGE0_AUTH_TOKEN
)) {
    throw new Error('MONGO_URI, REDIS_URL, CORS_ORIGIN, and JUDGE0_AUTH_TOKEN are required in production');
}

module.exports = {
    NODE_ENV,
    BACKEND_PORT: positiveInt('BACKEND_PORT', 5001, { max: 65535 }),
    TRUST_PROXY: positiveInt('TRUST_PROXY', 0, { min: 0, max: 10 }),
    MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/leetcode-clone',
    MONGO_POOL_SIZE: positiveInt('MONGO_POOL_SIZE', 20, { max: 200 }),
    JWT_ACCESS_SECRET: requiredSecret('JWT_ACCESS_SECRET', 'dev_only_access_secret'),
    JWT_REFRESH_SECRET: requiredSecret('JWT_REFRESH_SECRET', 'dev_only_refresh_secret'),
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '',
    COOKIE_SAME_SITE: ['strict', 'lax', 'none'].includes((process.env.COOKIE_SAME_SITE || '').toLowerCase())
        ? process.env.COOKIE_SAME_SITE.toLowerCase()
        : 'strict',
    ALLOW_BEARER_AUTH: process.env.ALLOW_BEARER_AUTH
        ? process.env.ALLOW_BEARER_AUTH === 'true'
        : !isProd,
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: positiveInt('REDIS_PORT', 6379, { max: 65535 }),
    REDIS_URL: process.env.REDIS_URL || '',
    JUDGE0_URL: process.env.JUDGE0_URL || 'http://localhost:2358',
    JUDGE0_AUTH_TOKEN: process.env.JUDGE0_AUTH_TOKEN || '',
    JUDGE0_TIMEOUT_MS: positiveInt('JUDGE0_TIMEOUT_MS', 20000, { min: 1000, max: 120000 }),
    JUDGE0_POLL_INTERVAL_MS: positiveInt('JUDGE0_POLL_INTERVAL_MS', 250, { min: 50, max: 5000 }),
    JUDGE0_CONCURRENCY: positiveInt('JUDGE0_CONCURRENCY', 4, { max: 32 }),
    // Allowed CORS origins (comma-separated in the env var).
    CORS_ORIGIN: corsOrigins,
    // Judge0 language IDs permitted for execution (default: common languages).
    ALLOWED_LANGUAGE_IDS: parseIntList(process.env.ALLOWED_LANGUAGE_IDS, '50,51,54,60,62,63,68,71,72,73,74'),
    // Maximum accepted source-code size in bytes.
    MAX_CODE_SIZE: positiveInt('MAX_CODE_SIZE', 65536, { min: 1024, max: 1048576 }),
    EVALUATION_WORKER_POLL_MS: positiveInt('EVALUATION_WORKER_POLL_MS', 500, { min: 50, max: 10000 }),
    EVALUATION_JOB_MAX_ATTEMPTS: positiveInt('EVALUATION_JOB_MAX_ATTEMPTS', 3, { max: 10 }),
    EVALUATION_JOB_RETENTION_DAYS: positiveInt('EVALUATION_JOB_RETENTION_DAYS', 7, { max: 90 }),
};
