const request = require('supertest');
const app = require('../src/app');
const Problem = require('../src/models/Problem');
const Submission = require('../src/models/Submission');

async function signup(overrides = {}) {
    const res = await request(app).post('/api/auth/signup').send({
        username: 'stats',
        email: 'stats@example.com',
        password: 'password123',
        role: 'User',
        ...overrides,
    });
    return { token: res.body.accessToken, id: res.body.user.id };
}

function makeProblem(slug, difficulty) {
    return Problem.create({ title: slug, slug, description: 'd', difficulty });
}

describe('GET /api/users/me/stats', () => {
    test('requires authentication', async () => {
        const res = await request(app).get('/api/users/me/stats');
        expect(res.status).toBe(401);
    });

    test('returns zeroes and difficulty totals with no submissions', async () => {
        const { token } = await signup();
        await makeProblem('e1', 'Easy');
        await makeProblem('m1', 'Medium');

        const res = await request(app)
            .get('/api/users/me/stats')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.totalProblems).toBe(2);
        expect(res.body.solved).toBe(0);
        expect(res.body.attempted).toBe(0);
        expect(res.body.totalSubmissions).toBe(0);
        expect(res.body.byDifficulty.Easy.total).toBe(1);
        expect(res.body.byDifficulty.Medium.total).toBe(1);
        expect(res.body.byDifficulty.Easy.solved).toBe(0);
    });

    test('counts solved, attempted, and by-difficulty', async () => {
        const { token, id } = await signup();
        const easy = await makeProblem('e1', 'Easy');
        const medium = await makeProblem('m1', 'Medium');
        await makeProblem('h1', 'Hard');

        // Two submissions on the easy problem: one wrong, then Accepted -> solved.
        await Submission.create({ userId: id, problemId: easy._id, code: 'x', languageId: 71, status: 'Wrong Answer' });
        await Submission.create({ userId: id, problemId: easy._id, code: 'x', languageId: 71, status: 'Accepted' });
        // One wrong submission on the medium problem -> attempted.
        await Submission.create({ userId: id, problemId: medium._id, code: 'x', languageId: 71, status: 'Wrong Answer' });

        const res = await request(app)
            .get('/api/users/me/stats')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.solved).toBe(1);
        expect(res.body.attempted).toBe(1);
        expect(res.body.totalSubmissions).toBe(3);
        expect(res.body.acceptedSubmissions).toBe(1);
        expect(res.body.byDifficulty.Easy.solved).toBe(1);
        expect(res.body.byDifficulty.Medium.solved).toBe(0);
        expect(res.body.byDifficulty.Hard.total).toBe(1);
    });

    test("does not count another user's submissions", async () => {
        const other = await signup({ username: 'other', email: 'other@example.com' });
        const easy = await makeProblem('e1', 'Easy');
        await Submission.create({ userId: other.id, problemId: easy._id, code: 'x', languageId: 71, status: 'Accepted' });

        const me = await signup({ username: 'meuser', email: 'me@example.com' });
        const res = await request(app)
            .get('/api/users/me/stats')
            .set('Authorization', `Bearer ${me.token}`);

        expect(res.body.solved).toBe(0);
        expect(res.body.totalSubmissions).toBe(0);
    });
});
