process.env.PAID_ENTITLEMENTS_ENFORCED = 'true';

const request = require('supertest');
const app = require('../src/app');
const Problem = require('../src/models/Problem');
const EntitlementGrant = require('../src/models/EntitlementGrant');

async function signup() {
    const response = await request(app).post('/api/auth/signup').send({
        username: 'access-user',
        email: 'access@example.com',
        password: 'password123',
    });
    return {
        token: response.body.accessToken,
        userId: response.body.user.id,
    };
}

describe('paid problem enforcement', () => {
    test('keeps the catalog visible while protecting paid details server-side', async () => {
        const { token, userId } = await signup();
        const auth = { Authorization: `Bearer ${token}` };
        await Problem.create([
            {
                title: 'Accuracy Score',
                slug: 'accuracy-score',
                description: 'Free problem',
                difficulty: 'Easy',
            },
            {
                title: 'Weighted Least Squares',
                slug: 'weighted-least-squares',
                description: 'Plus problem',
                difficulty: 'Hard',
            },
        ]);

        const catalog = await request(app).get('/api/problems').set(auth);
        expect(catalog.status).toBe(200);
        expect(catalog.body).toEqual(expect.arrayContaining([
            expect.objectContaining({ slug: 'accuracy-score', accessTier: 'free', locked: false }),
            expect.objectContaining({ slug: 'weighted-least-squares', accessTier: 'plus', locked: true }),
        ]));

        expect((await request(app).get('/api/problems/accuracy-score').set(auth)).status).toBe(200);
        const lockedDetail = await request(app).get('/api/problems/weighted-least-squares').set(auth);
        expect(lockedDetail.status).toBe(402);
        expect(lockedDetail.body).toMatchObject({ code: 'PLUS_REQUIRED', upgradeUrl: '/pricing' });
        expect((await request(app).get('/api/problems/weighted-least-squares/practice').set(auth)).status)
            .toBe(402);

        await EntitlementGrant.create({
            userId,
            tier: 'plus',
            benefits: ['all_problems'],
            sourceType: 'support',
            sourceId: userId,
            startsAt: new Date(Date.now() - 1000),
            endsAt: new Date(Date.now() + 60_000),
            status: 'active',
            reason: 'Test grant',
        });
        const unlocked = await request(app).get('/api/problems/weighted-least-squares').set(auth);
        expect(unlocked.status).toBe(200);
        expect(unlocked.body).toMatchObject({
            slug: 'weighted-least-squares',
            accessTier: 'plus',
            locked: false,
        });
    });
});
