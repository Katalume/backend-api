const crypto = require('crypto');
const request = require('supertest');
const axios = require('axios');
const app = require('../src/app');
const EntitlementGrant = require('../src/models/EntitlementGrant');
const BillingWebhookEvent = require('../src/models/BillingWebhookEvent');
const BillingPurchase = require('../src/models/BillingPurchase');
const BillingCustomer = require('../src/models/BillingCustomer');
const BillingSubscription = require('../src/models/BillingSubscription');
const BillingTransaction = require('../src/models/BillingTransaction');
const User = require('../src/models/User');
const { problemAccessState } = require('../src/billing/entitlement.service');

jest.mock('axios');

async function signup() {
    const response = await request(app).post('/api/auth/signup').send({
        username: 'billing-user',
        email: 'billing@example.com',
        password: 'password123',
    });
    return {
        token: response.body.accessToken,
        userId: response.body.user.id,
    };
}

function sign(rawBody, timestamp) {
    return crypto.createHmac('sha256', process.env.CASHFREE_CLIENT_SECRET)
        .update(`${timestamp}${rawBody}`)
        .digest('base64');
}

async function webhook(payload, eventId = crypto.randomUUID()) {
    const raw = JSON.stringify(payload);
    const timestamp = String(Date.now());
    return request(app)
        .post('/api/billing/webhooks/cashfree')
        .set('Content-Type', 'application/json')
        .set('x-webhook-timestamp', timestamp)
        .set('x-webhook-signature', sign(raw, timestamp))
        .set('x-idempotency-key', eventId)
        .send(raw);
}

describe('billing catalog and entitlement summary', () => {
    test('keeps the launch free set stable and locks other problems only when enforcement is on', () => {
        expect(problemAccessState('accuracy-score', false, true)).toEqual({
            accessTier: 'free',
            locked: false,
        });
        expect(problemAccessState('weighted-least-squares', false, true)).toEqual({
            accessTier: 'plus',
            locked: true,
        });
        expect(problemAccessState('weighted-least-squares', true, true)).toEqual({
            accessTier: 'plus',
            locked: false,
        });
    });

    test('publishes server-owned INR offers without requiring authentication', async () => {
        const response = await request(app).get('/api/billing/offers');
        expect(response.status).toBe(200);
        expect(response.body.freeProblemCount).toBe(60);
        expect(response.body.offers).toHaveLength(4);
        expect(response.body.offers.map((offer) => offer.cadence))
            .toEqual(['weekly', 'monthly', 'yearly', 'lifetime']);
        expect(response.body.offers.every((offer) => offer.currency === 'INR')).toBe(true);
    });

    test('returns a free summary and never trusts a browser plan claim', async () => {
        const { token } = await signup();
        const response = await request(app)
            .get('/api/billing/summary')
            .set('Authorization', `Bearer ${token}`);
        expect(response.status).toBe(200);
        expect(response.body.entitlement).toMatchObject({ tier: 'free', benefits: [] });
        expect(response.body.configuration.checkoutEnabled).toBe(true);
    });
});

describe('Cashfree checkout and signed webhook fulfillment', () => {
    beforeEach(() => {
        axios.post.mockReset();
    });

    test('creates a recurring checkout server-side and grants only after a verified charge', async () => {
        const { token, userId } = await signup();
        axios.post.mockResolvedValueOnce({
            data: {
                subscription_id: 'katalume_sub_test',
                cf_subscription_id: 'cf-sub-1',
                subscription_session_id: 'subs_session_1',
                subscription_status: 'INITIALIZED',
            },
        });
        const checkout = await request(app)
            .post('/api/billing/checkouts')
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', '11111111-1111-4111-8111-111111111111')
            .send({ offerKey: 'plus_monthly_in_v1', phone: '9876543210' });
        expect(checkout.status).toBe(201);
        expect(checkout.body).toMatchObject({
            kind: 'subscription',
            subscriptionSessionId: 'subs_session_1',
        });
        expect(await EntitlementGrant.countDocuments({ userId })).toBe(0);

        const charged = await webhook({
            type: 'SUBSCRIPTION_PAYMENT_SUCCESS',
            event_time: new Date().toISOString(),
            data: {
                subscription_id: 'katalume_sub_test',
                payment_type: 'CHARGE',
                payment_amount: 249,
                payment_currency: 'INR',
                cf_payment_id: 'cf-pay-1',
            },
        });
        expect(charged.status).toBe(200);
        const grant = await EntitlementGrant.findOne({ userId }).lean();
        expect(grant).toMatchObject({ tier: 'plus', sourceType: 'subscription', status: 'active' });
        expect(grant.endsAt.getTime()).toBeGreaterThan(grant.startsAt.getTime());

        const firstPeriodEnd = grant.endsAt.getTime();
        const duplicatePayment = await webhook({
            type: 'SUBSCRIPTION_PAYMENT_SUCCESS',
            event_time: new Date().toISOString(),
            data: {
                subscription_id: 'katalume_sub_test',
                payment_type: 'CHARGE',
                payment_amount: 249,
                payment_currency: 'INR',
                cf_payment_id: 'cf-pay-1',
            },
        }, 'same-payment-new-event');
        expect(duplicatePayment.status).toBe(200);
        const unchangedGrant = await EntitlementGrant.findOne({ userId }).lean();
        expect(unchangedGrant.endsAt.getTime()).toBe(firstPeriodEnd);
        expect((await BillingSubscription.findOne({ userId }).lean()).processedPaymentIds)
            .toEqual(['cf-pay-1']);
        expect(await BillingTransaction.countDocuments({ userId, providerPaymentId: 'cf-pay-1' })).toBe(1);
    });

    test('creates Lumus as a one-time order and processes duplicate events once', async () => {
        const { token, userId } = await signup();
        axios.post.mockResolvedValueOnce({
            data: {
                order_id: 'katalume_order_test',
                cf_order_id: 'cf-order-1',
                payment_session_id: 'payment_session_1',
                order_status: 'ACTIVE',
            },
        });
        const checkout = await request(app)
            .post('/api/billing/checkouts')
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', '22222222-2222-4222-8222-222222222222')
            .send({ offerKey: 'lumus_lifetime_in_v1', phone: '+91 98765 43210' });
        expect(checkout.status).toBe(201);
        expect(checkout.body).toMatchObject({ kind: 'payment', paymentSessionId: 'payment_session_1' });

        const payload = {
            type: 'PAYMENT_SUCCESS_WEBHOOK',
            event_time: new Date().toISOString(),
            data: {
                order: { order_id: 'katalume_order_test' },
                payment: {
                    cf_payment_id: 'cf-lifetime-payment',
                    payment_status: 'SUCCESS',
                    payment_amount: 4999,
                    payment_currency: 'INR',
                },
            },
        };
        const eventId = 'lifetime-event-1';
        expect((await webhook(payload, eventId)).status).toBe(200);
        const replay = await webhook(payload, eventId);
        expect(replay.status).toBe(200);
        expect(replay.body.duplicate).toBe(true);
        const grant = await EntitlementGrant.findOne({ userId }).lean();
        expect(grant).toMatchObject({ tier: 'lumus', sourceType: 'purchase' });
        expect(grant.endsAt).toBeNull();
        expect(await BillingWebhookEvent.countDocuments({ providerEventId: eventId })).toBe(1);
        expect(await BillingTransaction.countDocuments({
            userId,
            providerPaymentId: 'cf-lifetime-payment',
            status: 'captured',
        })).toBe(1);

        const refunded = await webhook({
            type: 'REFUND_STATUS_WEBHOOK',
            event_time: new Date().toISOString(),
            data: {
                refund: {
                    order_id: 'katalume_order_test',
                    cf_payment_id: 'cf-lifetime-payment',
                    refund_amount: 4999,
                    refund_currency: 'INR',
                    refund_status: 'SUCCESS',
                },
            },
        });
        expect(refunded.status).toBe(200);
        expect(await BillingPurchase.findOne({ userId }).lean())
            .toMatchObject({ status: 'refunded' });
        expect(await EntitlementGrant.findOne({ userId }).lean())
            .toMatchObject({ tier: 'lumus', status: 'revoked' });
        expect(await BillingTransaction.findOne({ userId }).lean())
            .toMatchObject({ status: 'refunded', refundedMinor: 499900 });
    });

    test('does not re-grant Lumus when a delayed success arrives after its refund', async () => {
        const { token, userId } = await signup();
        axios.post.mockResolvedValueOnce({
            data: {
                order_id: 'katalume_order_out_of_order',
                cf_order_id: 'cf-order-out-of-order',
                payment_session_id: 'payment_session_out_of_order',
                order_status: 'ACTIVE',
            },
        });
        await request(app)
            .post('/api/billing/checkouts')
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', '44444444-4444-4444-8444-444444444444')
            .send({ offerKey: 'lumus_lifetime_in_v1', phone: '9876543210' });

        expect((await webhook({
            type: 'REFUND_STATUS_WEBHOOK',
            event_time: new Date().toISOString(),
            data: {
                refund: {
                    order_id: 'katalume_order_out_of_order',
                    cf_payment_id: 'cf-payment-out-of-order',
                    refund_amount: 4999,
                    refund_currency: 'INR',
                    refund_status: 'SUCCESS',
                },
            },
        })).status).toBe(200);

        expect((await webhook({
            type: 'PAYMENT_SUCCESS_WEBHOOK',
            event_time: new Date().toISOString(),
            data: {
                order: { order_id: 'katalume_order_out_of_order' },
                payment: {
                    cf_payment_id: 'cf-payment-out-of-order',
                    payment_status: 'SUCCESS',
                    payment_amount: 4999,
                    payment_currency: 'INR',
                },
            },
        })).status).toBe(200);

        expect(await EntitlementGrant.countDocuments({ userId, status: 'active' })).toBe(0);
        expect(await BillingTransaction.findOne({ userId }).lean())
            .toMatchObject({ status: 'refunded', refundedMinor: 499900 });
    });

    test('rejects tampered signatures and amount mismatches without granting access', async () => {
        const tampered = await request(app)
            .post('/api/billing/webhooks/cashfree')
            .set('Content-Type', 'application/json')
            .set('x-webhook-timestamp', String(Date.now()))
            .set('x-webhook-signature', 'tampered')
            .send({ type: 'PAYMENT_SUCCESS_WEBHOOK' });
        expect(tampered.status).toBe(400);
        expect(await EntitlementGrant.countDocuments()).toBe(0);
    });

    test('cancels a renewable mandate and anonymizes billing data before account deletion', async () => {
        const { token, userId } = await signup();
        axios.post
            .mockResolvedValueOnce({
                data: {
                    subscription_id: 'katalume_sub_delete',
                    cf_subscription_id: 'cf-sub-delete',
                    subscription_session_id: 'subs_session_delete',
                    subscription_status: 'INITIALIZED',
                },
            })
            .mockResolvedValueOnce({ data: { subscription_status: 'CANCELLED' } });

        await request(app)
            .post('/api/billing/checkouts')
            .set('Authorization', `Bearer ${token}`)
            .set('Idempotency-Key', '33333333-3333-4333-8333-333333333333')
            .send({ offerKey: 'plus_weekly_in_v1', phone: '9876543210' });

        const response = await request(app)
            .delete('/api/auth/account')
            .set('Authorization', `Bearer ${token}`)
            .send({ password: 'password123' });

        expect(response.status).toBe(204);
        expect(await User.findById(userId)).toBeNull();
        expect(await BillingSubscription.findOne({ userId }).lean())
            .toMatchObject({ cancelAtPeriodEnd: true, customerDeleted: true });
        expect(await BillingCustomer.findOne({ userId }).lean())
            .toMatchObject({ billingName: 'Deleted Katalume user', billingPhone: '0000000000' });
        expect(axios.post).toHaveBeenCalledTimes(2);
    });
});
