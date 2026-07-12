const request = require('supertest');
const app = require('../src/app');
const Problem = require('../src/models/Problem');
const Submission = require('../src/models/Submission');

async function signup() {
    const res = await request(app).post('/api/auth/signup').send({
        username: 'profileuser',
        email: 'profile@example.com',
        password: 'password123',
        role: 'User',
    });
    return { token: res.body.accessToken, id: res.body.user.id };
}

describe('GET /api/profile/me', () => {
    test('requires authentication', async () => {
        const res = await request(app).get('/api/profile/me');
        expect(res.status).toBe(401);
    });

    test('returns the profile shape with real aggregates', async () => {
        const { token, id } = await signup();
        const p1 = await Problem.create({
            title: 'p1',
            slug: 'p1',
            description: 'd',
            difficulty: 'Easy',
            tags: ['ml'],
        });
        await Submission.create({ userId: id, problemId: p1._id, code: 'x', languageId: 71, status: 'Accepted' });
        await Submission.create({ userId: id, problemId: p1._id, code: 'x', languageId: 71, status: 'Wrong Answer' });

        const res = await request(app)
            .get('/api/profile/me')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.user.email).toBe('profile@example.com');
        expect(res.body.user.name).toBe('profileuser');
        expect(res.body.totalSolved).toBe(1);
        // 1 accepted of 2 total submissions.
        expect(res.body.acceptanceRate).toBe(50);
        expect(res.body.streakDays).toBeGreaterThanOrEqual(1);
        expect(res.body.heatmap).toHaveLength(120);
        expect(res.body.heatmap[119].count).toBe(2); // both submissions are "today"
        expect(res.body.topicProgress.find((t) => t.topic === 'ml')).toMatchObject({
            solved: 1,
            total: 1,
        });
        expect(Array.isArray(res.body.acceptanceTrend)).toBe(true);
    });
});
