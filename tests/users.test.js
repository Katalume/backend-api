const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');

async function createUser(overrides = {}) {
    const body = {
        username: 'user1',
        email: 'user1@example.com',
        password: 'password123',
        role: 'User',
        ...overrides,
    };
    const res = await request(app).post('/api/auth/signup').send(body);
    return { token: res.body.accessToken, id: res.body.user.id, body };
}

describe('user authorization', () => {
    test('a user can read their own record', async () => {
        const a = await createUser();
        const res = await request(app)
            .get(`/api/users/${a.id}`)
            .set('Authorization', `Bearer ${a.token}`);
        expect(res.status).toBe(200);
        expect(res.body.email).toBe(a.body.email);
    });

    test('a user cannot read another user record (IDOR)', async () => {
        const a = await createUser();
        const b = await createUser({ username: 'user2', email: 'user2@example.com' });
        const res = await request(app)
            .get(`/api/users/${b.id}`)
            .set('Authorization', `Bearer ${a.token}`);
        expect(res.status).toBe(403);
    });

    test('a user cannot self-promote to Admin via update (privilege escalation)', async () => {
        const a = await createUser();
        const res = await request(app)
            .put(`/api/users/${a.id}`)
            .set('Authorization', `Bearer ${a.token}`)
            .send({ roles: ['Admin'] });

        expect(res.status).toBe(200);
        expect(res.body.roles).toEqual(['User']);

        // Confirm it did not change in the database either.
        const inDb = await User.findById(a.id);
        expect(inDb.roles).toEqual(['User']);
    });

    test('a user cannot update another user record', async () => {
        const a = await createUser();
        const b = await createUser({ username: 'user2', email: 'user2@example.com' });
        const res = await request(app)
            .put(`/api/users/${b.id}`)
            .set('Authorization', `Bearer ${a.token}`)
            .send({ username: 'hacked' });
        expect(res.status).toBe(403);
    });

    test('a user can update their own display name and avatar without changing roles', async () => {
        const a = await createUser();
        const res = await request(app)
            .put(`/api/users/${a.id}`)
            .set('Authorization', `Bearer ${a.token}`)
            .send({
                username: 'alice-renamed',
                avatarUrl: 'https://images.example.com/alice.png',
                roles: ['Admin'],
            });
        expect(res.status).toBe(200);
        expect(res.body.username).toBe('alice-renamed');
        expect(res.body.avatarUrl).toBe('https://images.example.com/alice.png');
        expect(res.body.roles).toEqual(['User']);

        const login = await request(app)
            .post('/api/auth/login')
            .send({ email: a.body.email, password: a.body.password });
        expect(login.body.user.avatarUrl).toBe('https://images.example.com/alice.png');
    });

    test('invalid profile fields return 400', async () => {
        const a = await createUser();
        const res = await request(app)
            .put(`/api/users/${a.id}`)
            .set('Authorization', `Bearer ${a.token}`)
            .send({ username: 'x' });
        expect(res.status).toBe(400);
    });

    test('listing all users requires Admin', async () => {
        const a = await createUser();
        const res = await request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${a.token}`);
        expect(res.status).toBe(403);
    });

    test('an Admin can list users and read others', async () => {
        // Promote directly (as the seedAdmin script would).
        const admin = await createUser({ username: 'admin', email: 'admin@example.com' });
        await User.findByIdAndUpdate(admin.id, { roles: ['Admin'] });
        // Re-login so the token carries the Admin role.
        const login = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@example.com', password: 'password123' });
        const adminToken = login.body.accessToken;

        const other = await createUser({ username: 'user2', email: 'user2@example.com' });

        const list = await request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(list.status).toBe(200);
        expect(Array.isArray(list.body)).toBe(true);

        const read = await request(app)
            .get(`/api/users/${other.id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(read.status).toBe(200);
    });

    test('role changes take effect immediately instead of waiting for JWT expiry', async () => {
        const admin = await createUser({ username: 'admin', email: 'admin@example.com' });
        await User.updateOne({ _id: admin.id }, { roles: ['Admin'] });
        const login = await request(app).post('/api/auth/login').send({
            email: 'admin@example.com', password: 'password123',
        });
        expect((await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${login.body.accessToken}`)).status).toBe(200);
        await User.updateOne({ _id: admin.id }, { roles: ['User'] });
        expect((await request(app)
            .get('/api/admin/stats')
            .set('Authorization', `Bearer ${login.body.accessToken}`)).status).toBe(403);
    });
});
