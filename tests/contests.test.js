const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Problem = require('../src/models/Problem');
const Contest = require('../src/models/Contest');
const Leaderboard = require('../src/models/Leaderboard');

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

    test('GET /contests returns a lean list with counts, not raw participant ids', async () => {
        const token = await adminToken();
        const created = await request(app)
            .post('/api/contests')
            .set('Authorization', `Bearer ${token}`)
            .send(validContest);

        const { token: userTok } = await signup({ username: 'player', email: 'player@example.com' });
        await request(app)
            .post(`/api/contests/${created.body._id}/register`)
            .set('Authorization', `Bearer ${userTok}`);

        const res = await request(app).get('/api/contests');
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
        const contest = res.body[0];
        expect(contest.title).toBe(validContest.title);
        expect(contest.participantCount).toBe(1);
        expect(contest.problemCount).toBe(0);
        // The raw participant/problem arrays must not be exposed.
        expect(contest.participants).toBeUndefined();
        expect(contest.problems).toBeUndefined();
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
        expect(second.status).toBe(409);
    });
});

describe('contest management', () => {
    test('update and delete require authentication and Admin', async () => {
        const id = '507f1f77bcf86cd799439011';
        expect((await request(app).put(`/api/contests/${id}`).send(validContest)).status).toBe(401);
        expect((await request(app).delete(`/api/contests/${id}`)).status).toBe(401);
        const { token } = await signup();
        expect((await request(app).put(`/api/contests/${id}`).set('Authorization', `Bearer ${token}`).send(validContest)).status).toBe(403);
        expect((await request(app).delete(`/api/contests/${id}`).set('Authorization', `Bearer ${token}`)).status).toBe(403);
    });

    test('an admin updates and deletes a contest', async () => {
        const token = await adminToken();
        const created = await request(app)
            .post('/api/contests')
            .set('Authorization', `Bearer ${token}`)
            .send(validContest);
        const updated = await request(app)
            .put(`/api/contests/${created.body._id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Updated Contest', participants: ['507f1f77bcf86cd799439011'] });
        expect(updated.status).toBe(200);
        expect(updated.body.title).toBe('Updated Contest');
        expect(updated.body.participants).toEqual([]);
        expect((await request(app).delete(`/api/contests/${created.body._id}`).set('Authorization', `Bearer ${token}`)).status).toBe(200);
        expect((await request(app).delete(`/api/contests/${created.body._id}`).set('Authorization', `Bearer ${token}`)).status).toBe(404);
    });

    test('returns 404 for an unknown contest and 400 for invalid content', async () => {
        const token = await adminToken();
        const missing = await request(app)
            .put('/api/contests/507f1f77bcf86cd799439011')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Missing' });
        expect(missing.status).toBe(404);

        const created = await request(app)
            .post('/api/contests')
            .set('Authorization', `Bearer ${token}`)
            .send(validContest);
        const invalid = await request(app)
            .put(`/api/contests/${created.body._id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ startTime: 'not-a-date' });
        expect(invalid.status).toBe(400);
    });
});

describe('contest detail and leaderboard', () => {
    test('detail includes populated problems, timing, and participant count without participant ids', async () => {
        const problem = await Problem.create({ title: 'Contest Problem', slug: 'contest-problem', description: 'Solve it', difficulty: 'Hard' });
        const { id: playerId } = await signup();
        const contest = await Contest.create({ ...validContest, problems: [problem._id], participants: [playerId] });

        const res = await request(app).get(`/api/contests/${contest._id}`);
        expect(res.status).toBe(200);
        expect(res.body.startTime).toBe(validContest.startTime);
        expect(res.body.endTime).toBe(validContest.endTime);
        expect(res.body.participantCount).toBe(1);
        expect(res.body.participants).toBeUndefined();
        expect(res.body.problems[0]).toMatchObject({ title: 'Contest Problem', slug: 'contest-problem', difficulty: 'Hard' });
    });

    test('leaderboard is public and ranks stored entries by score then submission time', async () => {
        const alice = await signup({ username: 'alice', email: 'alice@example.com' });
        const bob = await signup({ username: 'bobby', email: 'bob@example.com' });
        const problem = await Problem.create({ title: 'P', slug: 'p', description: 'D' });
        const contest = await Contest.create(validContest);
        await Leaderboard.create([
            { contestId: contest._id, userId: bob.id, score: 2, problemsSolved: [problem._id], lastSubmissionTime: '2030-01-01T01:00:00.000Z' },
            { contestId: contest._id, userId: alice.id, score: 2, problemsSolved: [problem._id], lastSubmissionTime: '2030-01-01T00:30:00.000Z' },
        ]);

        const res = await request(app).get(`/api/contests/${contest._id}/leaderboard`);
        expect(res.status).toBe(200);
        expect(res.body.map((entry) => entry.username)).toEqual(['alice', 'bobby']);
        expect(res.body[0]).toMatchObject({ rank: 1, score: 2, problemsSolved: 1 });
        expect(res.body[1].rank).toBe(2);
    });

    test('detail and leaderboard return 404 for unknown contests and 400 for malformed ids', async () => {
        const unknown = '507f1f77bcf86cd799439011';
        expect((await request(app).get(`/api/contests/${unknown}`)).status).toBe(404);
        expect((await request(app).get(`/api/contests/${unknown}/leaderboard`)).status).toBe(404);
        expect((await request(app).get('/api/contests/not-an-id')).status).toBe(400);
        expect((await request(app).get('/api/contests/not-an-id/leaderboard')).status).toBe(400);
    });
});
