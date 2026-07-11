const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');

async function signup(overrides = {}) {
    const res = await request(app).post('/api/auth/signup').send({
        username: 'user1',
        email: 'u@example.com',
        password: 'password123',
        role: 'User',
        ...overrides,
    });
    return { token: res.body.accessToken, id: res.body.user.id };
}

async function adminToken() {
    const { id } = await signup({ username: 'admin', email: 'admin@example.com' });
    await User.findByIdAndUpdate(id, { roles: ['Admin'] });
    const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'password123' });
    return login.body.accessToken;
}

const validContest = {
    title: 'Weekly ML Contest',
    startTime: '2030-01-01T00:00:00.000Z',
    endTime: '2030-01-01T02:00:00.000Z',
};

describe('contests', () => {
    test('creating a contest requires Admin', async () => {
        const { token } = await signup();
        const res = await request(app)
            .post('/api/contests')
            .set('Authorization', `Bearer ${token}`)
            .send(validContest);
        expect(res.status).toBe(403);
    });

    test('an admin creates a contest', async () => {
        const token = await adminToken();
        const res = await request(app)
            .post('/api/contests')
            .set('Authorization', `Bearer ${token}`)
            .send(validContest);
        expect(res.status).toBe(201);
        expect(res.body.title).toBe(validContest.title);
    });

    test('missing required fields returns 400 (not 500)', async () => {
        const token = await adminToken();
        const res = await request(app)
            .post('/api/contests')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'No dates' });
        expect(res.status).toBe(400);
    });

    test('a user can register once for a contest', async () => {
        const token = await adminToken();
        const created = await request(app)
            .post('/api/contests')
            .set('Authorization', `Bearer ${token}`)
            .send(validContest);

        const { token: userTok } = await signup({ username: 'player', email: 'player@example.com' });

        const first = await request(app)
            .post(`/api/contests/${created.body._id}/register`)
            .set('Authorization', `Bearer ${userTok}`);
        expect(first.status).toBe(200);

        const second = await request(app)
            .post(`/api/contests/${created.body._id}/register`)
            .set('Authorization', `Bearer ${userTok}`);
        expect(second.status).toBe(400);
    });
});
