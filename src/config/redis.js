const { createClient } = require('redis');
const { REDIS_URL, REDIS_HOST, REDIS_PORT } = require('./env');
const logger = require('../utils/logger');

const client = createClient(REDIS_URL
    ? { url: REDIS_URL }
    : { socket: { host: REDIS_HOST, port: REDIS_PORT } });

client.on('error', (error) => logger.error('Redis client error', error));

async function connectRedis() {
    if (!client.isOpen) await client.connect();
    return client;
}

async function closeRedis() {
    if (client.isOpen) await client.quit();
}

module.exports = { client, connectRedis, closeRedis };
