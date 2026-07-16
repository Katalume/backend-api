const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Testcase = require('../src/models/Testcase');
const AuditEvent = require('../src/models/AuditEvent');

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
        const audit = await AuditEvent.findOne({ action: 'problem.create' });
        expect(audit).toMatchObject({ targetType: 'Problem', status: 201 });
        expect(String(audit.targetId)).toBe(res.body._id);
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

    test('GET /api/problems/:slug/practice returns the active browser-practice suite', async () => {
        const token = await adminToken();
        const created = await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send({
                ...problemBody,
                testcases: [
                    {
                        input: '{"value":1}',
                        expectedOutput: '1',
                        isPublic: true,
                        timeLimit: 1,
                        memoryLimit: 64000,
                    },
                    {
                        input: '{"value":2}',
                        expectedOutput: '2',
                        isPublic: false,
                    },
                ],
            });

        const res = await request(app).get(`/api/problems/${created.body.slug}/practice`);
        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.body).toMatchObject({
            problemId: created.body._id,
            slug: created.body.slug,
            testcaseVersion: 1,
        });
        expect(res.body.testcases).toEqual([
            {
                input: '{"value":1}',
                expectedOutput: '1',
                isPublic: true,
                timeLimit: 1,
                memoryLimit: 64000,
            },
            {
                input: '{"value":2}',
                expectedOutput: '2',
                isPublic: false,
                timeLimit: 2,
                memoryLimit: 128000,
            },
        ]);
    });

    test('GET /api/problems/:slug/practice returns 404 for an unknown problem', async () => {
        const res = await request(app).get('/api/problems/does-not-exist/practice');
        expect(res.status).toBe(404);
    });

    test('keeps editorials locked until the authenticated user has an accepted submission', async () => {
        const token = await adminToken();
        const created = await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send({ ...problemBody, editorial: { summary: 'Secret solution', approach: 'Do it' } });
        const user = await userToken({ username: 'solver', email: 'solver@example.com' });
        const locked = await request(app)
            .get(`/api/problems/${created.body.slug}`)
            .set('Authorization', `Bearer ${user.token}`);
        expect(locked.body.editorial).toBeUndefined();

        const Submission = require('../src/models/Submission');
        await Submission.create({
            userId: user.id, problemId: created.body._id, code: 'x', languageId: 71, status: 'Accepted',
        });
        const unlocked = await request(app)
            .get(`/api/problems/${created.body.slug}`)
            .set('Authorization', `Bearer ${user.token}`);
        expect(unlocked.body.editorial.summary).toBe('Secret solution');
    });

    test('GET /api/problems/:slug returns 404 for unknown slug', async () => {
        const res = await request(app).get('/api/problems/does-not-exist');
        expect(res.status).toBe(404);
    });
});

describe('problem management', () => {
    test('update and delete require authentication', async () => {
        const update = await request(app).put('/api/problems/507f1f77bcf86cd799439011').send(problemBody);
        const remove = await request(app).delete('/api/problems/507f1f77bcf86cd799439011');
        expect(update.status).toBe(401);
        expect(remove.status).toBe(401);
    });

    test('update and delete reject a non-admin', async () => {
        const { token } = await userToken();
        const update = await request(app)
            .put('/api/problems/507f1f77bcf86cd799439011')
            .set('Authorization', `Bearer ${token}`)
            .send(problemBody);
        const remove = await request(app)
            .delete('/api/problems/507f1f77bcf86cd799439011')
            .set('Authorization', `Bearer ${token}`);
        expect(update.status).toBe(403);
        expect(remove.status).toBe(403);
    });

    test('an admin updates content while keeping the slug immutable', async () => {
        const token = await adminToken();
        const created = await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send(problemBody);
        const res = await request(app)
            .put(`/api/problems/${created.body._id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Updated KNN', difficulty: 'Hard', slug: 'changed' });
        expect(res.status).toBe(200);
        expect(res.body.title).toBe('Updated KNN');
        expect(res.body.difficulty).toBe('Hard');
        expect(res.body.slug).toBe(created.body.slug);
    });

    test('atomically switches to a new testcase version during admin edits', async () => {
        const token = await adminToken();
        const created = await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send({ ...problemBody, testcases: [{ input: 'old', expectedOutput: 'old' }] });
        const updated = await request(app)
            .put(`/api/problems/${created.body._id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ testcases: [{ input: 'new', expectedOutput: 'new', timeLimit: 1, memoryLimit: 64000 }] });
        expect(updated.status).toBe(200);
        expect(updated.body.testcaseVersion).toBe(2);
        const active = await Testcase.find({ problemId: created.body._id });
        expect(active).toHaveLength(1);
        expect(active[0]).toMatchObject({ version: 2, input: 'new', timeLimit: 1, memoryLimit: 64000 });
    });

    test('returns 404 for an unknown problem and 400 for invalid content', async () => {
        const token = await adminToken();
        const missing = await request(app)
            .put('/api/problems/507f1f77bcf86cd799439011')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Missing' });
        const created = await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send(problemBody);
        const invalid = await request(app)
            .put(`/api/problems/${created.body._id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ difficulty: 'Impossible' });
        expect(missing.status).toBe(404);
        expect(invalid.status).toBe(400);
    });

    test('deleting a problem also deletes its test cases', async () => {
        const token = await adminToken();
        const created = await request(app)
            .post('/api/problems')
            .set('Authorization', `Bearer ${token}`)
            .send({ ...problemBody, testcases: [{ input: '1', expectedOutput: '1' }] });
        const res = await request(app)
            .delete(`/api/problems/${created.body._id}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(await Testcase.countDocuments({ problemId: created.body._id })).toBe(0);

        const missing = await request(app)
            .delete(`/api/problems/${created.body._id}`)
            .set('Authorization', `Bearer ${token}`);
        expect(missing.status).toBe(404);
    });
});
