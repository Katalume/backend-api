const { EXECUTION_MODE } = require('../config/env');

function requireServerExecution(req, res, next) {
    if (EXECUTION_MODE === 'judge0') return next();

    return res.status(503).json({
        code: 'SERVER_EXECUTION_UNAVAILABLE',
        message: 'Ranked server execution is not available during the free public beta.',
        requestId: req.requestId,
    });
}

module.exports = { requireServerExecution };
