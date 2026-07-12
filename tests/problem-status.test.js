const request = require('supertest');
const app = require('../src/app');
const Problem = require('../src/models/Problem');
const Submission = require('../src/models/Submission');

async function signup(overrides = {}) {
    const res = await request(app).post('/api/auth/signup').send({
        username: 'solver',
        email: 'solver@example.com',
        password: 'password123',
        role: 'User',
        ...overrides,
    });
    return { token: res.body.accessToken, id: res.body.user.id };
}

async function makeProblem(slug, tags = []) {
    return Problem.create({
        title: slug,
        slug,
        description: 'desc',
        difficulty: 'Easy',
        tags,
    });
}

describe('GET /api/problems solved-state', () => {
    test('anonymous requests get no per-user status', async () => {
        await makeProblem('p-anon');
        const res = await request(app).get('/api/problems');
        expect(res.status).toBe(200);
        expect(res.body[0].status).toBeUndefined();
    });

    test('marks solved / attempted / unsolved for the authenticated user', async () => {
        const { token, id } = await signup();
        const solvedP = await makeProblem('solved-problem');
        const attemptedP = await makeProblem('attempted-problem');
        await makeProblem('untouched-problem');

        await Submission.create({
            userId: id,
            problemId: solvedP._id,
            code: 'x',
            languageId: 71,
            status: 'Accepted',
        });
        await Submission.create({
            userId: id,
            problemId: attemptedP._id,
            code: 'x',
            languageId: 71,
            status: 'Wrong Answer',
        });

        const res = await request(app)
            .get('/api/problems')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);

        const bySlug = Object.fromEntries(res.body.map((p) => [p.slug, p.status]));
        expect(bySlug['solved-problem']).toBe('solved');
        expect(bySlug['attempted-problem']).toBe('attempted');
        expect(bySlug['untouched-problem']).toBe('unsolved');
    });

    test('another user does not inherit the first user\'s status', async () => {
        const first = await signup();
        const solvedP = await makeProblem('shared-problem');
        await Submission.create({
            userId: first.id,
            problemId: solvedP._id,
            code: 'x',
            languageId: 71,
            status: 'Accepted',
        });

        const second = await signup({ username: 'other', email: 'other@example.com' });
        const res = await request(app)
            .get('/api/problems')
            .set('Authorization', `Bearer ${second.token}`);
        const shared = res.body.find((p) => p.slug === 'shared-problem');
        expect(shared.status).toBe('unsolved');
    });

    test('an invalid token is treated as anonymous, not rejected', async () => {
        await makeProblem('p-badtoken');
        const res = await request(app)
            .get('/api/problems')
            .set('Authorization', 'Bearer garbage');
        expect(res.status).toBe(200);
        expect(res.body[0].status).toBeUndefined();
    });

    test('filters by any requested track tag and preserves user status', async () => {
        const { token, id } = await signup();
        const matching = await makeProblem('matching-problem', ['ranking', 'retrieval']);
        await makeProblem('other-problem', ['pandas']);
        await Submission.create({
            userId: id,
            problemId: matching._id,
            code: 'x',
            languageId: 71,
            status: 'Accepted',
        });

        const res = await request(app)
            .get('/api/problems?tags=ranking,offline-metrics')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toMatchObject({ slug: 'matching-problem', status: 'solved' });
    });

    test('rejects an excessive tags filter', async () => {
        const tags = Array.from({ length: 11 }, (_, index) => `tag-${index}`).join(',');
        const res = await request(app).get(`/api/problems?tags=${tags}`);
        expect(res.status).toBe(400);
    });
});
