const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Testcase = require('../src/models/Testcase');

async function userToken(overrides = {}) {
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
    const { id } = await userToken({ username: 'admin', email: 'admin@example.com' });
    await User.findByIdAndUpdate(id, { roles: ['Admin'] });
    const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'password123' });
    return login.body.accessToken;
}

const problemBody = {
    title: 'K Nearest Neighbors',
    description: 'Implement KNN.',
    difficulty: 'Easy',
    starterCode: 'def solve():\n    pass',
    constraints: ['1 <= k <= n'],
};

describe('problem creation authorization', () => {
    test('requires a token', async () => {
        const res = await request(app).post('/api/problems').send(problemBody);
        expect(res.status).toBe(401);
    });

    test('rejects a non-admin', async () => {
        const { token } = await userToken();
        const res = await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send(problemBody);
        expect(res.status).toBe(403);
    });
});

describe('createProblem', () => {
    test('an admin creates a problem and gets a generated slug', async () => {
        const token = await adminToken();
        const res = await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send(problemBody);
        expect(res.status).toBe(201);
        expect(res.body.slug).toBe('k-nearest-neighbors');
        expect(res.body.starterCode).toBe(problemBody.starterCode);
    });

    test('duplicate titles get distinct slugs instead of a 500', async () => {
        const token = await adminToken();
        const first = await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send(problemBody);
        const second = await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send(problemBody);
        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(second.body.slug).not.toBe(first.body.slug);
        expect(second.body.slug).toBe('k-nearest-neighbors-2');
    });

    test('rejects missing title/description with 400', async () => {
        const token = await adminToken();
        const res = await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send({ description: 'no title' });
        expect(res.status).toBe(400);
    });

    test('stores provided test cases', async () => {
        const token = await adminToken();
        const res = await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send({
                ...problemBody,
                testcases: [
                    { input: '1', expectedOutput: '1', isPublic: false },
                    { input: '2', expectedOutput: '2', isPublic: false },
                ],
            });
        const count = await Testcase.countDocuments({ problemId: res.body._id });
        expect(count).toBe(2);
    });
});

describe('reading problems', () => {
    test('GET /api/problems is public and lists problems', async () => {
        const token = await adminToken();
        await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send(problemBody);
        const res = await request(app).get('/api/problems');
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
    });

    test('GET /api/problems/:slug includes hiddenTestCount', async () => {
        const token = await adminToken();
        const created = await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send({
                ...problemBody,
                testcases: [
                    { input: '1', expectedOutput: '1', isPublic: false },
                    { input: '2', expectedOutput: '2', isPublic: true },
                ],
            });

        const res = await request(app).get(`/api/problems/${created.body.slug}`);
        expect(res.status).toBe(200);
        expect(res.body.hiddenTestCount).toBe(1);
        expect(res.body.starterCode).toBe(problemBody.starterCode);
    });

    test('GET /api/problems/:slug returns 404 for unknown slug', async () => {
        const res = await request(app).get('/api/problems/does-not-exist');
        expect(res.status).toBe(404);
    });
});
