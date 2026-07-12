const request = require('supertest');
const app = require('../src/app');
const LearningTrack = require('../src/models/LearningTrack');
const User = require('../src/models/User');

async function userToken(overrides = {}) {
    const res = await request(app).post('/api/auth/signup').send({
        username: 'learner',
        email: 'learner@example.com',
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

describe('POST /api/learn/tracks', () => {
    test('requires a token', async () => {
        const res = await request(app).post('/api/learn/tracks').send({ title: 'X' });
        expect(res.status).toBe(401);
    });

    test('rejects a non-admin', async () => {
        const { token } = await userToken();
        const res = await request(app)
            .post('/api/learn/tracks')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'X' });
        expect(res.status).toBe(403);
    });

    test('an admin creates a track with a generated slug and lessonCount', async () => {
        const token = await adminToken();
        const res = await request(app)
            .post('/api/learn/tracks')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Deep Learning Basics', tags: ['dl'], lessons: ['A', 'B'] });
        expect(res.status).toBe(201);
        expect(res.body.slug).toBe('deep-learning-basics');
        expect(res.body.lessonCount).toBe(2);
    });

    test('rejects a missing title with 400', async () => {
        const token = await adminToken();
        const res = await request(app)
            .post('/api/learn/tracks')
            .set('Authorization', `Bearer ${token}`)
            .send({ description: 'no title' });
        expect(res.status).toBe(400);
    });
});

describe('GET /api/learn/tracks', () => {
    test('is public and empty when nothing is seeded', async () => {
        const res = await request(app).get('/api/learn/tracks');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    test('returns tracks with a lessonCount, ordered by order', async () => {
        await LearningTrack.create({
            slug: 'second',
            title: 'Second',
            order: 2,
            lessons: ['a'],
        });
        await LearningTrack.create({
            slug: 'first',
            title: 'First',
            order: 1,
            lessons: ['a', 'b', 'c'],
        });

        const res = await request(app).get('/api/learn/tracks');
        expect(res.status).toBe(200);
        expect(res.body.map((t) => t.slug)).toEqual(['first', 'second']);
        expect(res.body[0].lessonCount).toBe(3);
        expect(res.body[1].lessonCount).toBe(1);
    });
});

describe('learning track management', () => {
    test('update and delete require authentication and Admin', async () => {
        const id = '507f1f77bcf86cd799439011';
        expect((await request(app).put(`/api/learn/tracks/${id}`).send({ title: 'X' })).status).toBe(401);
        expect((await request(app).delete(`/api/learn/tracks/${id}`)).status).toBe(401);

        const { token } = await userToken();
        expect((await request(app).put(`/api/learn/tracks/${id}`).set('Authorization', `Bearer ${token}`).send({ title: 'X' })).status).toBe(403);
        expect((await request(app).delete(`/api/learn/tracks/${id}`).set('Authorization', `Bearer ${token}`)).status).toBe(403);
    });

    test('an admin updates a track without changing its slug', async () => {
        const token = await adminToken();
        const created = await request(app)
            .post('/api/learn/tracks')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'ML Basics', lessons: ['One'] });
        const res = await request(app)
            .put(`/api/learn/tracks/${created.body.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'ML Foundations', lessons: ['One', 'Two'], order: 3, slug: 'changed' });
        expect(res.status).toBe(200);
        expect(res.body.slug).toBe('ml-basics');
        expect(res.body.title).toBe('ML Foundations');
        expect(res.body.lessonCount).toBe(2);
        expect(res.body.order).toBe(3);
    });

    test('returns 404 for unknown ids, 400 for malformed ids, and deletes a track', async () => {
        const token = await adminToken();
        const unknown = await request(app)
            .put('/api/learn/tracks/507f1f77bcf86cd799439011')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Missing' });
        const invalid = await request(app)
            .put('/api/learn/tracks/not-an-id')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'Invalid' });
        expect(unknown.status).toBe(404);
        expect(invalid.status).toBe(400);

        const track = await LearningTrack.create({ slug: 'delete-me', title: 'Delete me' });
        expect((await request(app).delete(`/api/learn/tracks/${track._id}`).set('Authorization', `Bearer ${token}`)).status).toBe(200);
        expect((await request(app).delete(`/api/learn/tracks/${track._id}`).set('Authorization', `Bearer ${token}`)).status).toBe(404);
    });
});
