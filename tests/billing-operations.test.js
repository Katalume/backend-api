const request = require('supertest');
const axios = require('axios');
const app = require('../src/app');
const User = require('../src/models/User');
const BillingCustomer = require('../src/models/BillingCustomer');
const BillingSubscription = require('../src/models/BillingSubscription');
const BillingTransaction = require('../src/models/BillingTransaction');
const BillingOperationalAlert = require('../src/models/BillingOperationalAlert');

jest.mock('axios');

const MONTHLY_OFFER = ['plus', 'monthly', 'in', 'v1'].join('_');

async function signup(username, email) {
    const response = await request(app).post('/api/auth/signup').send({
        username,
        email,
        password: 'password123',
    });
    return {
        token: response.body.accessToken,
        userId: response.body.user.id,
    };
}

async function adminToken() {
    const account = await signup('billing-admin', 'billing-admin@example.com');
    await User.updateOne({ _id: account.userId }, { roles: ['Admin'] });
    const login = await request(app).post('/api/auth/login').send({
        email: 'billing-admin@example.com',
        password: 'password123',
    });
    return login.body.accessToken;
}

function offerSnapshot() {
    return {
        offerKey: MONTHLY_OFFER,
        name: 'Plus Monthly',
        tier: 'plus',
        cadence: 'monthly',
        currency: 'INR',
        amountMinor: 24900,
        benefits: ['all_problems'],
        version: 1,
    };
}

describe('billing receipts and owner operations', () => {
    beforeEach(() => {
        axios.get.mockReset();
    });

    test('returns only the authenticated user payment receipts and labels them as non-tax invoices', async () => {
        const owner = await signup('receipt-owner', 'receipt-owner@example.com');
        const other = await signup('receipt-other', 'receipt-other@example.com');
        const customer = await BillingCustomer.create({
            userId: owner.userId,
            provider: 'cashfree',
            billingName: 'Receipt Owner',
            billingEmail: 'receipt-owner@example.com',
            billingPhone: '9876543210',
        });
        await BillingTransaction.create({
            userId: owner.userId,
            billingCustomerId: customer._id,
            sourceType: 'purchase',
            sourceId: customer._id,
            offerKey: 'lumus_lifetime_in_v1',
            offerSnapshot: { ...offerSnapshot(), name: 'Lumus Lifetime', cadence: 'lifetime' },
            provider: 'cashfree',
            providerPaymentId: 'cf-receipt-1',
            amountMinor: 499900,
            currency: 'INR',
            status: 'captured',
            occurredAt: new Date(),
        });

        const response = await request(app)
            .get('/api/billing/receipts')
            .set('Authorization', `Bearer ${owner.token}`);
        expect(response.status).toBe(200);
        expect(response.body.receipts).toHaveLength(1);
        expect(response.body.receipts[0]).toMatchObject({
            label: 'Payment receipt',
            isTaxInvoice: false,
            providerPaymentReference: 'cf-receipt-1',
        });
        const otherResponse = await request(app)
            .get('/api/billing/receipts')
            .set('Authorization', `Bearer ${other.token}`);
        expect(otherResponse.body.receipts).toEqual([]);
    });

    test('reconciliation detects a paid source without access and exposes a sanitized admin workflow', async () => {
        const token = await adminToken();
        const user = await signup('reconcile-user', 'reconcile-user@example.com');
        const customer = await BillingCustomer.create({
            userId: user.userId,
            provider: 'cashfree',
            billingName: 'Reconcile User',
            billingEmail: 'reconcile-user@example.com',
            billingPhone: '9876543210',
        });
        await BillingSubscription.create({
            userId: user.userId,
            billingCustomerId: customer._id,
            offerKey: MONTHLY_OFFER,
            offerSnapshot: offerSnapshot(),
            provider: 'cashfree',
            providerSubscriptionId: 'katalume_sub_reconcile',
            checkoutSessionId: 'subscription-session',
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        });
        axios.get.mockResolvedValue({ data: { subscription_status: 'ACTIVE' } });

        const run = await request(app)
            .post('/api/admin/billing/reconcile')
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(run.status).toBe(201);
        expect(run.body).toMatchObject({ status: 'succeeded', drifted: 1 });

        const alerts = await request(app)
            .get('/api/admin/billing/alerts?status=open')
            .set('Authorization', `Bearer ${token}`);
        expect(alerts.status).toBe(200);
        expect(alerts.body.alerts[0]).toMatchObject({
            kind: 'missing_entitlement',
            severity: 'critical',
            status: 'open',
        });

        const resolved = await request(app)
            .post(`/api/admin/billing/alerts/${alerts.body.alerts[0]._id}/resolve`)
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(resolved.status).toBe(200);
        expect(await BillingOperationalAlert.findById(resolved.body._id).lean())
            .toMatchObject({ status: 'resolved' });

        const customers = await request(app)
            .get('/api/admin/billing/customers?query=reconcile')
            .set('Authorization', `Bearer ${token}`);
        expect(customers.status).toBe(200);
        expect(customers.body.customers[0]).toMatchObject({
            billingEmail: 'reconcile-user@example.com',
            phoneLastFour: '3210',
        });
        expect(customers.body.customers[0].billingPhone).toBeUndefined();
    });

    test('ordinary users cannot read billing operations', async () => {
        const user = await signup('plain-user', 'plain-user@example.com');
        const response = await request(app)
            .get('/api/admin/billing/overview')
            .set('Authorization', `Bearer ${user.token}`);
        expect(response.status).toBe(403);
    });
});
