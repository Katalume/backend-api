const request = require('supertest');
const app = require('../src/app');
const Problem = require('../src/models/Problem');
const Submission = require('../src/models/Submission');

async function signup() {
    const res = await request(app).post('/api/auth/signup').send({
        username: 'progress',
        email: 'progress@example.com',
        password: 'password123',
        role: 'User',
    });
    return { token: res.body.accessToken, id: res.body.user.id };
}

describe('GET /api/users/me/progress', () => {
    test('requires authentication', async () => {
        const res = await request(app).get('/api/users/me/progress');
        expect(res.status).toBe(401);
    });

    test('returns a 7-day week, streaks, and topic coverage', async () => {
        const { token, id } = await signup();
        const p1 = await Problem.create({
            title: 'p1',
            slug: 'p1',
            description: 'd',
            difficulty: 'Easy',
            tags: ['arrays', 'ml'],
        });
        const p2 = await Problem.create({
            title: 'p2',
            slug: 'p2',
            description: 'd',
            difficulty: 'Medium',
            tags: ['ml'],
        });

        await Submission.create({ userId: id, problemId: p1._id, code: 'x', languageId: 71, status: 'Accepted' });
        await Submission.create({ userId: id, problemId: p2._id, code: 'x', languageId: 71, status: 'Wrong Answer' });

        const res = await request(app)
            .get('/api/users/me/progress')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.weekly).toHaveLength(7);
        // Today's bucket (last entry) has one solved problem.
        expect(res.body.weekly[6].solved).toBe(1);
        // Solved something today -> current streak at least 1.
        expect(res.body.currentStreak).toBeGreaterThanOrEqual(1);
        expect(res.body.longestStreak).toBeGreaterThanOrEqual(1);

        const topics = Object.fromEntries(res.body.topics.map((t) => [t.tag, t]));
        // 'ml' is on both problems (total 2); only p1 is solved.
        expect(topics.ml.total).toBe(2);
        expect(topics.ml.solved).toBe(1);
        // 'arrays' only on p1, which is solved.
        expect(topics.arrays.total).toBe(1);
        expect(topics.arrays.solved).toBe(1);
    });
});
