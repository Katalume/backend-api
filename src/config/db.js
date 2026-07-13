const mongoose = require('mongoose');
const { MONGO_URI, MONGO_POOL_SIZE, NODE_ENV } = require('./env');
const logger = require('../utils/logger');

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            autoIndex: NODE_ENV !== 'production',
            maxPoolSize: MONGO_POOL_SIZE,
            serverSelectionTimeoutMS: 10000,
        });
        logger.info('MongoDB connected');
    } catch (err) {
        logger.error('MongoDB connection error', { error: err });
        process.exit(1);
    }
};

module.exports = connectDB;
