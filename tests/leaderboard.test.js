const request = require('supertest');
const app = require('../src/app');
const Problem = require('../src/models/Problem');
const Submission = require('../src/models/Submission');

async function signup(username, email) {
    const res = await request(app).post('/api/auth/signup').send({
        username,
        email,
        password: 'password123',
        role: 'User',
    });
    return res.body.user.id;
}

function makeProblem(slug) {
    return Problem.create({ title: slug, slug, description: 'd', difficulty: 'Easy' });
}

describe('GET /api/leaderboard', () => {
    test('is public and empty with no submissions', async () => {
        const res = await request(app).get('/api/leaderboard');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    test('ranks users by distinct problems solved', async () => {
        const alice = await signup('alice', 'alice@example.com');
        const bob = await signup('bob', 'bob@example.com');
        const p1 = await makeProblem('p1');
        const p2 = await makeProblem('p2');

        // Alice solves 2 distinct problems (p1 twice — counts once — and p2).
        await Submission.create({ userId: alice, problemId: p1._id, code: 'x', languageId: 71, status: 'Accepted' });
        await Submission.create({ userId: alice, problemId: p1._id, code: 'x', languageId: 71, status: 'Accepted' });
        await Submission.create({ userId: alice, problemId: p2._id, code: 'x', languageId: 71, status: 'Accepted' });
        // Bob solves 1.
        await Submission.create({ userId: bob, problemId: p1._id, code: 'x', languageId: 71, status: 'Accepted' });
        // A non-accepted submission does not count.
        await Submission.create({ userId: bob, problemId: p2._id, code: 'x', languageId: 71, status: 'Wrong Answer' });

        const res = await request(app).get('/api/leaderboard');
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(2);
        expect(res.body[0]).toMatchObject({ rank: 1, username: 'alice', solved: 2 });
        expect(res.body[1]).toMatchObject({ rank: 2, username: 'bob', solved: 1 });
    });
});
