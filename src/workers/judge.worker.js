const mongoose = require('mongoose');
const connectDB = require('../config/db');
const logger = require('../utils/logger');
const { processNextJob } = require('../services/evaluation.service');
const { EVALUATION_WORKER_POLL_MS } = require('../config/env');

let stopping = false;

async function wait(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startWorker() {
    await connectDB();
    logger.info('Evaluation worker started');
    while (!stopping) {
        const processed = await processNextJob();
        if (!processed) await wait(EVALUATION_WORKER_POLL_MS);
    }
    await mongoose.connection.close();
    logger.info('Evaluation worker stopped');
}

for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
        logger.info(`${signal} received by evaluation worker`);
        stopping = true;
    });
}

if (require.main === module) {
    startWorker().catch((error) => {
        logger.error('Evaluation worker failed', error);
        process.exit(1);
    });
}

module.exports = { startWorker };
