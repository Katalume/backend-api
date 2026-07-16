const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const mongoose = require('mongoose');
const crypto = require('crypto');
const connectDB = require('./config/db');
const { client: redisClient, connectRedis, closeRedis } = require('./config/redis');
const logger = require('./utils/logger');
const { BACKEND_PORT, CORS_ORIGIN, TRUST_PROXY, REDIS_URL, EXECUTION_MODE } = require('./config/env');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');
const { rejectUnsafeInput } = require('./middleware/requestGuard');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const problemRoutes = require('./routes/problem.routes');
const submissionRoutes = require('./routes/submission.routes');
const contestRoutes = require('./routes/contest.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

app.set('trust proxy', TRUST_PROXY);
app.disable('x-powered-by');

// Security headers
app.use(helmet());

// Body parsing with a size limit to bound request payloads
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Correlate client errors, logs, and traces without exposing internals.
app.use((req, res, next) => {
    const incomingRequestId = req.get('x-request-id');
    req.requestId = incomingRequestId && /^[A-Za-z0-9._:-]{1,128}$/.test(incomingRequestId)
        ? incomingRequestId
        : crypto.randomUUID();
    res.set('x-request-id', req.requestId);
    const json = res.json.bind(res);
    res.json = (body) => json(
        res.statusCode >= 400 && body && typeof body === 'object' && !Array.isArray(body)
            ? { ...body, requestId: body.requestId || req.requestId }
            : body
    );
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
        logger.info('http_request', {
            requestId: req.requestId,
            method: req.method,
            path: req.originalUrl.split('?')[0],
            status: res.statusCode,
            durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
            userId: req.user?.id,
        });
    });
    next();
});

// CORS — origins configured via env (comma-separated CORS_ORIGIN)
app.use(cors({
    origin: CORS_ORIGIN,
    credentials: true
}));

// Health check (before rate limiting so probes are never throttled)
app.get("/health", (req, res) => {
    res.status(200).json({ status: 'ok', requestId: req.requestId });
});

app.get('/ready', (req, res) => {
    const dependencies = {
        mongo: mongoose.connection.readyState === 1,
        redis: !REDIS_URL || redisClient.isReady,
    };
    const ready = Object.values(dependencies).every(Boolean);
    res.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not_ready',
        dependencies,
        execution: EXECUTION_MODE,
        requestId: req.requestId,
    });
});

// General API rate limiting
app.use('/api', rejectUnsafeInput);
app.use('/api', apiLimiter);

// Routes (auth + execution endpoints get stricter dedicated limiters)
app.use('/api/auth', require('./routes/oauth.routes'));
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/runner', require('./routes/runner.routes'));
app.use('/api/contests', contestRoutes);
app.use('/api/profile', require('./routes/profile.routes'));
app.use('/api/leaderboard', require('./routes/leaderboard.routes'));
app.use('/api/learn', require('./routes/learn.routes'));
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Not Found', requestId: req.requestId });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    logger.error('Unhandled error', { requestId: req.requestId, error: err });
    const status = err.status || 500;
    res.status(status).json({
        message: status === 500 ? 'Internal Server Error' : err.message,
        requestId: req.requestId,
    });
});

// Start the server only after the database connection is established.
async function start() {
    await Promise.all([connectDB(), connectRedis()]);
    const server = app.listen(BACKEND_PORT, () => {
        logger.info(`Katalume API running on port ${BACKEND_PORT}`);
    });

    // Graceful shutdown: stop accepting connections, then close the DB.
    const shutdown = (signal) => {
        logger.info(`${signal} received, shutting down gracefully`);
        server.close(async () => {
            await Promise.all([mongoose.connection.close(), closeRedis()]);
            logger.info('Closed server and database connections');
            process.exit(0);
        });
        // Force-exit if graceful shutdown hangs.
        setTimeout(() => {
            logger.error('Could not close connections in time, forcing exit');
            process.exit(1);
        }, 10000).unref();
    };

    ['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => shutdown(sig)));
}

if (require.main === module) {
    start().catch((err) => {
        logger.error('Failed to start server:', err);
        process.exit(1);
    });
}

module.exports = app;
