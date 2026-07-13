const request = require('supertest');
const app = require('../src/app');

describe('request input guard', () => {
    test('rejects nested Mongo operators before they reach controllers', async () => {
        const res = await request(app).post('/api/auth/login').send({
            email: { $where: 'sleep(1000)' },
            password: 'password123',
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/unsafe/i);
        expect(res.body.requestId).toBeTruthy();
    });

    test('adds a stable request id to health and error responses', async () => {
        const health = await request(app).get('/health').set('X-Request-Id', 'trace-123');
        expect(health.headers['x-request-id']).toBe('trace-123');
        expect(health.body.requestId).toBe('trace-123');
        const missing = await request(app).get('/missing');
        expect(missing.headers['x-request-id']).toBeTruthy();
        expect(missing.body.requestId).toBe(missing.headers['x-request-id']);
    });
});
