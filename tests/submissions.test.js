const request = require('supertest');

// Mock Judge0 so submissions don't reach a real executor.
jest.mock('../src/services/judge.service', () => ({
    execute: jest.fn().mockResolvedValue({
        status: { id: 3, description: 'Accepted' },
        time: '0.01',
        memory: 1024,
        stdout: '',
    }),
    executeBatch: jest.fn().mockResolvedValue([
        { status: { id: 3, description: 'Accepted' }, time: '0.01', memory: 1024, stdout: '' },
    ]),
    getLanguages: jest.fn().mockResolvedValue([]),
}));

const app = require('../src/app');
const Problem = require('../src/models/Problem');
const Testcase = require('../src/models/Testcase');

async function signup(overrides = {}) {
    const res = await request(app).post('/api/auth/signup').send({
        username: 'coder',
        email: 'coder@example.com',
        password: 'password123',
        role: 'User',
        ...overrides,
    });
    return res.body.accessToken;
}

describe('submissions', () => {
    test('GET /api/submissions requires authentication', async () => {
        const res = await request(app).get('/api/submissions');
        expect(res.status).toBe(401);
    });

    test('rejects a disallowed language before executing', async () => {
        const token = await signup();
        const problem = await Problem.create({ title: 'P', slug: 'p', description: 'desc', difficulty: 'Easy' });
        const res = await request(app)
            .post('/api/submissions')
            .set('Authorization', `Bearer ${token}`)
            .send({ problemId: problem._id, code: 'print(1)', languageId: 9999 });
        expect(res.status).toBe(400);
    });

    test('submits, judges (mocked), and stores an Accepted result', async () => {
        const token = await signup();
        const problem = await Problem.create({ title: 'P', slug: 'p', description: 'desc', difficulty: 'Easy' });
        await Testcase.create({
            problemId: problem._id,
            input: '1',
            expectedOutput: '1',
            isPublic: true,
        });

        const res = await request(app)
            .post('/api/submissions')
            .set('Authorization', `Bearer ${token}`)
            .send({ problemId: problem._id, code: 'print(1)', languageId: 71 });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('Accepted');
    });

    test('GET /api/submissions filters by problemId', async () => {
        const token = await signup();
        const p1 = await Problem.create({ title: 'One', slug: 'one', description: 'desc', difficulty: 'Easy' });
        const p2 = await Problem.create({ title: 'Two', slug: 'two', description: 'desc', difficulty: 'Easy' });
        await Testcase.create({ problemId: p1._id, input: '1', expectedOutput: '1' });
        await Testcase.create({ problemId: p2._id, input: '1', expectedOutput: '1' });

        const submit = (problemId) =>
            request(app)
                .post('/api/submissions')
                .set('Authorization', `Bearer ${token}`)
                .send({ problemId, code: 'print(1)', languageId: 71 });

        await submit(p1._id);
        await submit(p2._id);

        const all = await request(app)
            .get('/api/submissions')
            .set('Authorization', `Bearer ${token}`);
        expect(all.body.length).toBe(2);

        const onlyP1 = await request(app)
            .get(`/api/submissions?problemId=${p1._id}`)
            .set('Authorization', `Bearer ${token}`);
        expect(onlyP1.body.length).toBe(1);
        expect(String(onlyP1.body[0].problemId._id || onlyP1.body[0].problemId)).toBe(
            String(p1._id)
        );
    });
});

describe('unknown routes', () => {
    test('returns 404 JSON', async () => {
        const res = await request(app).get('/api/does-not-exist');
        expect(res.status).toBe(404);
        expect(res.body.message).toBe('Not Found');
    });
});
