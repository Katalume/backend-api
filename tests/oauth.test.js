jest.mock('axios');
const axios = require('axios');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const oauthService = require('../src/services/oauth.service');

const FRONTEND = 'https://app.test.katalume.dev';

afterEach(() => jest.clearAllMocks());

describe('GET /api/auth/providers', () => {
    test('lists the configured social providers', async () => {
        const res = await request(app).get('/api/auth/providers');
        expect(res.status).toBe(200);
        const ids = res.body.providers.map((p) => p.id).sort();
        expect(ids).toEqual(['github', 'google']);
        expect(res.body.providers.find((p) => p.id === 'google').name).toBe('Google');
    });
});

describe('GET /api/auth/oauth/:provider (start)', () => {
    test('redirects to the provider with client_id, redirect_uri and state', async () => {
        const res = await request(app).get('/api/auth/oauth/google');
        expect(res.status).toBe(302);
        const location = new URL(res.headers.location);
        expect(location.origin + location.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
        expect(location.searchParams.get('client_id')).toBe('test-google-id');
        expect(location.searchParams.get('redirect_uri')).toBe(
            'https://api.test.katalume.dev/api/auth/oauth/google/callback'
        );
        expect(location.searchParams.get('state')).toMatch(/^[a-f0-9]{48}$/);
        // Express URL-encodes the cookie value ("google:..." -> "google%3A..."),
        // which cookie-parser transparently decodes on the callback.
        expect(res.headers['set-cookie'].join(';')).toMatch(/katalume_oauth_state=google%3A/);
    });

    test('redirects to the login page for an unknown/disabled provider', async () => {
        const res = await request(app).get('/api/auth/oauth/twitter');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`${FRONTEND}/login?error=oauth_unavailable`);
    });
});

describe('GET /api/auth/oauth/:provider/callback', () => {
    test('rejects a missing/mismatched state (CSRF guard)', async () => {
        const res = await request(app).get('/api/auth/oauth/google/callback?code=abc&state=nope');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`${FRONTEND}/login?error=oauth_state`);
    });

    test('completes the flow: creates a user and sets the session cookies', async () => {
        axios.post.mockResolvedValue({ data: { access_token: 'provider-access-token' } });
        axios.get.mockResolvedValue({
            data: {
                sub: 'google-sub-123',
                email: 'NewOAuth@Example.com',
                email_verified: true,
                name: 'OAuth Newcomer',
                picture: 'https://img/avatar.png',
            },
        });

        const agent = request.agent(app);
        const start = await agent.get('/api/auth/oauth/google');
        // The agent stores the state cookie; read the matching state value from
        // the authorize redirect so it is independent of cookie encoding.
        const state = new URL(start.headers.location).searchParams.get('state');

        const res = await agent.get(`/api/auth/oauth/google/callback?code=real-code&state=${state}`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(`${FRONTEND}/problems`);

        const cookies = res.headers['set-cookie'].join(';');
        expect(cookies).toMatch(/katalume_session=/);
        expect(cookies).toMatch(/katalume_access=/);

        const user = await User.findOne({ email: 'newoauth@example.com' });
        expect(user).toBeTruthy();
        expect(user.provider).toBe('google');
        expect(user.providerId).toBe('google-sub-123');
        expect(user.emailVerified).toBe(true);
        expect(user.password).toBeUndefined();
    });
});

describe('oauthService.findOrCreateOAuthUser', () => {
    const profile = {
        providerId: 'gh-999',
        email: 'dev@example.com',
        name: 'Dev Person',
        avatarUrl: 'https://img/gh.png',
        emailVerified: true,
    };

    test('creates a new passwordless account, then returns the same one on repeat', async () => {
        const first = await oauthService.findOrCreateOAuthUser(profile, 'github');
        expect(first.provider).toBe('github');
        expect(first.password).toBeUndefined();
        const second = await oauthService.findOrCreateOAuthUser(profile, 'github');
        expect(String(second._id)).toBe(String(first._id));
        expect(await User.countDocuments({ email: 'dev@example.com' })).toBe(1);
    });

    test('links to an existing account when the provider verified the email', async () => {
        const existing = await User.create({
            username: 'existing',
            email: 'dev@example.com',
            password: 'password123',
            provider: 'local',
        });
        const linked = await oauthService.findOrCreateOAuthUser(profile, 'github');
        expect(String(linked._id)).toBe(String(existing._id));
    });

    test('refuses to link an unverified email (prevents account takeover)', async () => {
        await User.create({
            username: 'victim',
            email: 'dev@example.com',
            password: 'password123',
            provider: 'local',
        });
        await expect(
            oauthService.findOrCreateOAuthUser({ ...profile, emailVerified: false }, 'github')
        ).rejects.toMatchObject({ code: 'OAUTH_EMAIL_UNVERIFIED' });
    });
});

describe('User model — social accounts', () => {
    test('allows a social account with no password', async () => {
        const user = await User.create({
            username: 'socialuser',
            email: 'social@example.com',
            provider: 'google',
            providerId: 'g-1',
        });
        expect(user._id).toBeTruthy();
    });

    test('still requires a password for local accounts', async () => {
        await expect(
            User.create({ username: 'localuser', email: 'local@example.com', provider: 'local' })
        ).rejects.toThrow();
    });
});
