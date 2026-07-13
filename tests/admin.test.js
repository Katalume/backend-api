const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Problem = require('../src/models/Problem');
const AuditEvent = require('../src/models/AuditEvent');

async function adminToken() {
    const signup = await request(app).post('/api/auth/signup').send({
        username: 'admin', email: 'admin@example.com', password: 'password123', role: 'User',
    });
    await User.updateOne({ _id: signup.body.user.id }, { roles: ['Admin'] });
    const login = await request(app).post('/api/auth/login').send({
        email: 'admin@example.com', password: 'password123',
    });
    return login.body.accessToken;
}

describe('admin operations', () => {
    test('returns aggregate platform statistics', async () => {
        const token = await adminToken();
        await Problem.create({ title: 'One', slug: 'one', description: 'd' });
        const response = await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${token}`);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ users: 1, problems: 1, submissions: 0 });
    });

    test('paginates the immutable admin audit stream', async () => {
        const token = await adminToken();
        const actor = await User.findOne({ email: 'admin@example.com' });
        await AuditEvent.create({
            actorId: actor._id,
            action: 'problem.create',
            targetType: 'Problem',
            targetId: 'p1',
            createdAt: new Date('2026-01-01T00:00:00Z'),
        });
        const response = await request(app)
            .get('/api/admin/audit?limit=1')
            .set('Authorization', `Bearer ${token}`);
        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0]).toMatchObject({ action: 'problem.create', targetId: 'p1' });
        expect(response.body[0].actorId.email).toBe('admin@example.com');
    });
});
