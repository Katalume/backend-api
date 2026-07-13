const mockRedisClient = {
    isOpen: false,
    isReady: false,
    on: jest.fn(),
    connect: jest.fn(async () => { mockRedisClient.isOpen = true; }),
    quit: jest.fn(async () => { mockRedisClient.isOpen = false; }),
};

jest.mock('redis', () => ({ createClient: jest.fn(() => mockRedisClient) }));

const { connectRedis, closeRedis } = require('../src/config/redis');

describe('Redis lifecycle', () => {
    test('connects once and closes an open client cleanly', async () => {
        await connectRedis();
        await connectRedis();
        expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
        await closeRedis();
        expect(mockRedisClient.quit).toHaveBeenCalledTimes(1);
        await closeRedis();
        expect(mockRedisClient.quit).toHaveBeenCalledTimes(1);
    });
});
