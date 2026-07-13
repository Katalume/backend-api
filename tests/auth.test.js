const request = require('supertest');
const app = require('../src/app');

const validUser = {
    username: 'alice',
    email: 'alice@example.com',
    password: 'password123',
    role: 'User',
};

describe('POST /api/auth/signup', () => {
    test('creates a user and returns an access token', async () => {
        const res = await request(app).post('/api/auth/signup').send(validUser);
        expect(res.status).toBe(201);
        expect(res.body.accessToken).toBeTruthy();
        expect(res.body.user.email).toBe('alice@example.com');
        expect(res.body.user.roles).toEqual(['User']);
        const cookies = res.headers['set-cookie'].join(';');
        expect(cookies).toMatch(/mlboost_session=/);
        expect(cookies).toMatch(/mlboost_access=/);
        expect(cookies).toMatch(/HttpOnly/);
        expect(cookies).toMatch(/SameSite=Strict/);
    });

    test('rejects a duplicate email', async () => {
        await request(app).post('/api/auth/signup').send(validUser);
        const res = await request(app).post('/api/auth/signup').send(validUser);
        expect(res.status).toBe(409);
    });

    test('rejects an invalid role', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send({ ...validUser, role: 'Admin' });
        expect(res.status).toBe(400);
    });

    test('accepts a name-only payload (derives a username, defaults role)', async () => {
        const res = await request(app).post('/api/auth/signup').send({
            name: 'Live Tester',
            email: 'live@example.com',
            password: 'password123',
        });
        expect(res.status).toBe(201);
        expect(res.body.user.roles).toEqual(['User']);
        expect(res.body.user.username).toBeTruthy();
        expect(res.body.accessToken).toBeTruthy();
    });

    test('derives distinct usernames for the same name', async () => {
        const body = { name: 'Same Name', email: 'a@example.com', password: 'password123' };
        const first = await request(app).post('/api/auth/signup').send(body);
        const second = await request(app)
            .post('/api/auth/signup')
            .send({ ...body, email: 'b@example.com' });
        expect(first.body.user.username).not.toBe(second.body.user.username);
    });

    test('rejects a short password (validation)', async () => {
        const res = await request(app)
            .post('/api/auth/signup')
            .send({ ...validUser, password: 'short' });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/auth/login', () => {
    beforeEach(async () => {
        await request(app).post('/api/auth/signup').send(validUser);
    });

    test('logs in with correct credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: validUser.email, password: validUser.password });
        expect(res.status).toBe(200);
        expect(res.body.accessToken).toBeTruthy();
    });

    test('rejects a wrong password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: validUser.email, password: 'wrongpass' });
        expect(res.status).toBe(401);
    });

    test('rejects a NoSQL-injection payload', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: { $gt: '' }, password: { $gt: '' } });
        expect(res.status).toBe(400);
    });
});

describe('token-protected routes', () => {
    test('GET /api/users/me requires a valid token', async () => {
        const res = await request(app).get('/api/users/me');
        expect(res.status).toBe(401);
    });

    test('GET /api/users/me returns the current user with a token', async () => {
        const signup = await request(app).post('/api/auth/signup').send(validUser);
        const res = await request(app)
            .get('/api/users/me')
            .set('Authorization', `Bearer ${signup.body.accessToken}`);
        expect(res.status).toBe(200);
        expect(res.body.email).toBe(validUser.email);
        expect(res.body.password).toBeUndefined();
    });

    test('accepts the httpOnly access cookie without browser-readable bearer storage', async () => {
        const agent = request.agent(app);
        await agent.post('/api/auth/signup').send(validUser).expect(201);
        const res = await agent.get('/api/users/me');
        expect(res.status).toBe(200);
        expect(res.body.email).toBe(validUser.email);
    });

    test('rejects a garbage token', async () => {
        const res = await request(app)
            .get('/api/users/me')
            .set('Authorization', 'Bearer not-a-real-token');
        expect(res.status).toBe(403);
    });
});

describe('POST /api/auth/refresh', () => {
    test('issues a new access token from the refresh cookie', async () => {
        const signup = await request(app).post('/api/auth/signup').send(validUser);
        const cookie = signup.headers['set-cookie'];
        const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
        expect(res.status).toBe(200);
        expect(res.body.accessToken).toBeTruthy();
        expect(res.headers['set-cookie'].join(';')).toMatch(/mlboost_session=/);
        const reused = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
        expect(reused.status).toBe(403);
        expect(reused.body.message).toMatch(/reuse/i);
    });

    test('rejects when no refresh cookie is present', async () => {
        const res = await request(app).post('/api/auth/refresh');
        expect(res.status).toBe(401);
    });
});

describe('GET /api/auth/session', () => {
    test('returns the current user from the httpOnly session cookie', async () => {
        const agent = request.agent(app);
        await agent.post('/api/auth/signup').send(validUser).expect(201);
        const res = await agent.get('/api/auth/session');
        expect(res.status).toBe(200);
        expect(res.body.authenticated).toBe(true);
        expect(res.body.user.email).toBe(validUser.email);
        expect(res.headers['cache-control']).toBe('no-store');
    });

    test('rejects missing and forged session cookies', async () => {
        expect((await request(app).get('/api/auth/session')).status).toBe(401);
        const forged = await request(app)
            .get('/api/auth/session')
            .set('Cookie', 'mlboost_session=forged');
        expect(forged.status).toBe(401);
    });

    test('logout clears the session and invalidates subsequent checks', async () => {
        const agent = request.agent(app);
        await agent.post('/api/auth/signup').send(validUser).expect(201);
        const logout = await agent.post('/api/auth/logout');
        expect(logout.status).toBe(204);
        expect(logout.headers['set-cookie'].join(';')).toMatch(/mlboost_session=;/);
        expect((await agent.get('/api/auth/session')).status).toBe(401);
    });
});

describe('account lifecycle', () => {
    test('changes password and revokes other sessions', async () => {
        await request(app).post('/api/auth/signup').send(validUser);
        const first = await request(app).post('/api/auth/login').send({
            email: validUser.email, password: validUser.password,
        });
        const second = await request(app).post('/api/auth/login').send({
            email: validUser.email, password: validUser.password,
        });
        const changed = await request(app)
            .put('/api/auth/password')
            .set('Authorization', `Bearer ${first.body.accessToken}`)
            .send({ currentPassword: validUser.password, newPassword: 'new-password-123' });
        expect(changed.status).toBe(204);
        expect((await request(app).get('/api/users/me').set('Authorization', `Bearer ${second.body.accessToken}`)).status).toBe(403);
        expect((await request(app).post('/api/auth/login').send({ email: validUser.email, password: validUser.password })).status).toBe(401);
        expect((await request(app).post('/api/auth/login').send({ email: validUser.email, password: 'new-password-123' })).status).toBe(200);
    });

    test('exports and permanently deletes the authenticated account', async () => {
        const signup = await request(app).post('/api/auth/signup').send(validUser);
        const auth = { Authorization: `Bearer ${signup.body.accessToken}` };
        const exported = await request(app).get('/api/auth/account').set(auth);
        expect(exported.status).toBe(200);
        expect(exported.headers['content-disposition']).toMatch(/attachment/);
        expect(exported.body.user.email).toBe(validUser.email);
        expect(exported.body.user.password).toBeUndefined();

        const deleted = await request(app)
            .delete('/api/auth/account')
            .set(auth)
            .send({ password: validUser.password });
        expect(deleted.status).toBe(204);
        expect((await request(app).post('/api/auth/login').send({
            email: validUser.email, password: validUser.password,
        })).status).toBe(401);
    });
});
