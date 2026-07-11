const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const { BACKEND_PORT, CORS_ORIGIN } = require('./config/env');
const { apiLimiter, authLimiter, executionLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const problemRoutes = require('./routes/problem.routes');
const submissionRoutes = require('./routes/submission.routes');
const contestRoutes = require('./routes/contest.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Security headers
app.use(helmet());

// Body parsing with a size limit to bound request payloads
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// CORS — origins configured via env (comma-separated CORS_ORIGIN)
app.use(cors({
    origin: CORS_ORIGIN,
    credentials: true
}));

// Health check (before rate limiting so probes are never throttled)
app.get("/health", (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// General API rate limiting
app.use('/api', apiLimiter);

// Routes (auth + execution endpoints get stricter dedicated limiters)
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/submissions', executionLimiter, submissionRoutes);
app.use('/api/runner', executionLimiter, require('./routes/runner.routes'));
app.use('/api/contests', contestRoutes);
app.use('/api/leaderboard', require('./routes/leaderboard.routes'));
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Not Found' });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    const status = err.status || 500;
    res.status(status).json({
        message: status === 500 ? 'Internal Server Error' : err.message,
    });
});

// Start the server only after the database connection is established.
async function start() {
    await connectDB();
    const server = app.listen(BACKEND_PORT, () => {
        logger.info(`Server running on port ${BACKEND_PORT}`);
    });

    // Graceful shutdown: stop accepting connections, then close the DB.
    const shutdown = (signal) => {
        logger.info(`${signal} received, shutting down gracefully`);
        server.close(async () => {
            await mongoose.connection.close();
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
