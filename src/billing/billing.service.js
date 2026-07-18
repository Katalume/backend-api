const crypto = require('crypto');
const User = require('../models/User');
const BillingCustomer = require('../models/BillingCustomer');
const BillingSubscription = require('../models/BillingSubscription');
const BillingPurchase = require('../models/BillingPurchase');
const BillingWebhookEvent = require('../models/BillingWebhookEvent');
const EntitlementGrant = require('../models/EntitlementGrant');
const { getOffer, OFFERS, publicOffer } = require('../config/billingOffers');
const {
    BILLING_ENABLED,
    CHECKOUT_ENABLED,
    BILLING_WEBHOOK_PROCESSING_ENABLED,
    PAID_ENTITLEMENTS_ENFORCED,
    BILLING_PROVIDER,
} = require('../config/env');
const { getEffectiveEntitlement } = require('./entitlement.service');
const cashfree = require('./providers/cashfree.adapter');

class BillingError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function offerSnapshot(offer) {
    return {
        offerKey: offer.offerKey,
        name: offer.name,
        tier: offer.tier,
        cadence: offer.cadence,
        currency: offer.currency,
        amountMinor: offer.amountMinor,
        benefits: offer.benefits,
        version: 1,
    };
}

function publicConfiguration() {
    return {
        billingEnabled: BILLING_ENABLED,
        checkoutEnabled: BILLING_ENABLED && CHECKOUT_ENABLED,
        enforcementEnabled: PAID_ENTITLEMENTS_ENFORCED,
        provider: BILLING_ENABLED ? BILLING_PROVIDER : 'disabled',
        environment: cashfree.environment,
    };
}

function listOffers() {
    return {
        offers: OFFERS.filter((offer) => offer.status === 'active').map(publicOffer),
        configuration: publicConfiguration(),
        freeProblemCount: 60,
    };
}

async function billingSummary(userId) {
    const [entitlement, subscription, purchase] = await Promise.all([
        getEffectiveEntitlement(userId),
        BillingSubscription.findOne({ userId }).sort({ createdAt: -1 }).lean(),
        BillingPurchase.findOne({ userId, status: 'captured' }).sort({ capturedAt: -1 }).lean(),
    ]);
    return {
        entitlement,
        subscription: subscription ? {
            id: String(subscription._id),
            offerKey: subscription.offerKey,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd || null,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        } : null,
        purchase: purchase ? {
            id: String(purchase._id),
            offerKey: purchase.offerKey,
            status: purchase.status,
            capturedAt: purchase.capturedAt,
        } : null,
        configuration: publicConfiguration(),
    };
}

function requireCheckoutConfiguration() {
    if (!BILLING_ENABLED || !CHECKOUT_ENABLED || BILLING_PROVIDER !== 'cashfree') {
        throw new BillingError(
            503,
            'BILLING_NOT_CONFIGURED',
            'Secure checkout is not active yet. Your account has not been charged.'
        );
    }
}

function normalizePhone(value) {
    return String(value || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
}

async function upsertCustomer(userId, phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
        throw new BillingError(400, 'INVALID_PHONE', 'Enter a valid 10-digit Indian mobile number.');
    }
    const user = await User.findById(userId).select('username email').lean();
    if (!user) throw new BillingError(404, 'USER_NOT_FOUND', 'User not found.');
    return BillingCustomer.findOneAndUpdate(
        { userId, provider: 'cashfree' },
        {
            $set: {
                billingName: user.username,
                billingEmail: user.email,
                billingPhone: normalizedPhone,
            },
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
    );
}

function stableProviderId(prefix, userId, idempotencyKey) {
    const digest = crypto.createHash('sha256')
        .update(`${userId}:${idempotencyKey}`)
        .digest('hex')
        .slice(0, 28);
    return `katalume_${prefix}_${digest}`;
}

async function createCheckout({ userId, offerKey, phone, idempotencyKey, requestId }) {
    requireCheckoutConfiguration();
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(idempotencyKey || '')) {
        throw new BillingError(400, 'INVALID_IDEMPOTENCY_KEY', 'A UUID idempotency key is required.');
    }
    const offer = getOffer(offerKey);
    if (!offer) throw new BillingError(404, 'OFFER_NOT_FOUND', 'This offer is unavailable.');

    const effective = await getEffectiveEntitlement(userId);
    if (effective.tier === 'lumus') {
        throw new BillingError(409, 'ALREADY_LUMUS', 'Lumus lifetime access is already active.');
    }
    const customer = await upsertCustomer(userId, phone);

    if (offer.cadence === 'lifetime') {
        const orderId = stableProviderId('order', userId, idempotencyKey);
        const existing = await BillingPurchase.findOne({ providerOrderId: orderId }).lean();
        if (existing) {
            return {
                kind: 'payment',
                paymentSessionId: existing.checkoutSessionId,
                providerResourceId: existing.providerOrderId,
                environment: cashfree.environment,
            };
        }
        const provider = await cashfree.createOrder({
            orderId,
            offer,
            customer,
            idempotencyKey,
            requestId,
        });
        await BillingPurchase.create({
            userId,
            billingCustomerId: customer._id,
            offerKey,
            offerSnapshot: offerSnapshot(offer),
            provider: 'cashfree',
            providerOrderId: provider.providerOrderId,
            checkoutSessionId: provider.paymentSessionId,
            status: 'pending',
        });
        return {
            kind: 'payment',
            paymentSessionId: provider.paymentSessionId,
            providerResourceId: provider.providerOrderId,
            environment: cashfree.environment,
        };
    }

    const subscriptionId = stableProviderId('sub', userId, idempotencyKey);
    const existing = await BillingSubscription.findOne({ providerSubscriptionId: subscriptionId }).lean();
    if (existing) {
        return {
            kind: 'subscription',
            subscriptionSessionId: existing.checkoutSessionId,
            providerResourceId: existing.providerSubscriptionId,
            environment: cashfree.environment,
        };
    }
    const provider = await cashfree.createSubscription({
        subscriptionId,
        offer,
        customer,
        idempotencyKey,
        requestId,
    });
    await BillingSubscription.create({
        userId,
        billingCustomerId: customer._id,
        offerKey,
        offerSnapshot: offerSnapshot(offer),
        provider: 'cashfree',
        providerSubscriptionId: provider.providerSubscriptionId,
        providerReferenceId: provider.providerReferenceId,
        checkoutSessionId: provider.subscriptionSessionId,
        status: 'pending',
    });
    return {
        kind: 'subscription',
        subscriptionSessionId: provider.subscriptionSessionId,
        providerResourceId: provider.providerSubscriptionId,
        environment: cashfree.environment,
    };
}

function addCadence(start, cadence) {
    const end = new Date(start);
    if (cadence === 'weekly') end.setUTCDate(end.getUTCDate() + 7);
    if (cadence === 'monthly') end.setUTCMonth(end.getUTCMonth() + 1);
    if (cadence === 'yearly') end.setUTCFullYear(end.getUTCFullYear() + 1);
    return end;
}

async function syncSubscriptionGrant(subscription) {
    await EntitlementGrant.findOneAndUpdate(
        { sourceType: 'subscription', sourceId: subscription._id, status: 'active' },
        {
            $set: {
                userId: subscription.userId,
                tier: 'plus',
                benefits: subscription.offerSnapshot.benefits,
                startsAt: subscription.currentPeriodStart,
                endsAt: subscription.currentPeriodEnd,
                reason: 'Verified Cashfree subscription charge',
            },
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
    );
}

async function grantSubscription(subscription, providerPaymentId, occurredAt) {
    if (subscription.processedPaymentIds.includes(providerPaymentId)) {
        // Repair the entitlement if a prior attempt committed the subscription
        // period but was interrupted before the grant write.
        await syncSubscriptionGrant(subscription);
        return false;
    }
    const start = subscription.currentPeriodEnd && subscription.currentPeriodEnd > occurredAt
        ? subscription.currentPeriodEnd
        : occurredAt;
    const end = addCadence(start, subscription.offerSnapshot.cadence);
    subscription.status = 'active';
    subscription.currentPeriodStart = start;
    subscription.currentPeriodEnd = end;
    subscription.processedPaymentIds.push(providerPaymentId);
    subscription.latestProviderEventAt = occurredAt;
    await subscription.save();
    await syncSubscriptionGrant(subscription);
    return true;
}

async function grantLifetime(purchase, providerPaymentId, occurredAt) {
    purchase.status = 'captured';
    purchase.providerPaymentId = providerPaymentId;
    purchase.capturedAt = occurredAt;
    await purchase.save();
    await EntitlementGrant.findOneAndUpdate(
        { sourceType: 'purchase', sourceId: purchase._id, status: 'active' },
        {
            $set: {
                userId: purchase.userId,
                tier: 'lumus',
                benefits: purchase.offerSnapshot.benefits,
                startsAt: occurredAt,
                endsAt: null,
                reason: 'Verified Cashfree lifetime purchase',
            },
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
    );
}

function eventIdentifiers(payload, headers, rawBody) {
    const raw = rawBody || JSON.stringify(payload);
    const payloadHash = crypto.createHash('sha256').update(raw).digest('hex');
    const eventId = headers['x-idempotency-key']
        || `${payload.type || 'unknown'}:${payload.data?.payment?.cf_payment_id
            || payload.data?.cf_payment_id
            || payload.data?.subscription_details?.cf_subscription_id
            || payloadHash}`;
    return { payloadHash, eventId };
}

async function acquireWebhookEvent(payload, headers, rawBody) {
    const { payloadHash, eventId } = eventIdentifiers(payload, headers, rawBody);
    let record = await BillingWebhookEvent.findOne({ provider: 'cashfree', providerEventId: eventId });
    if (record) {
        if (record.payloadHash !== payloadHash) {
            throw new BillingError(409, 'CONFLICTING_WEBHOOK_REPLAY', 'Webhook event payload conflict.');
        }
        if (record.status === 'processed' || record.status === 'ignored') {
            return { duplicate: true, record };
        }
        const staleProcessing = record.status === 'processing'
            && record.processingStartedAt
            && record.processingStartedAt < new Date(Date.now() - 5 * 60 * 1000);
        if (record.status === 'processing' && !staleProcessing) {
            return { duplicate: true, record };
        }
        const acquired = await BillingWebhookEvent.findOneAndUpdate(
            {
                _id: record._id,
                status: record.status,
                ...(record.processingStartedAt ? { processingStartedAt: record.processingStartedAt } : {}),
            },
            {
                $set: {
                    status: 'processing',
                    processingStartedAt: new Date(),
                    errorCode: '',
                },
            },
            { returnDocument: 'after' }
        );
        return acquired ? { duplicate: false, record: acquired } : { duplicate: true, record };
    }

    try {
        record = await BillingWebhookEvent.create({
            provider: 'cashfree',
            providerEventId: eventId,
            eventType: payload.type || 'UNKNOWN',
            payloadHash,
            occurredAt: new Date(payload.event_time || Date.now()),
            processingStartedAt: new Date(),
            status: 'processing',
        });
        return { duplicate: false, record };
    } catch (error) {
        if (error?.code !== 11000) throw error;
        record = await BillingWebhookEvent.findOne({ provider: 'cashfree', providerEventId: eventId });
        if (!record || record.payloadHash !== payloadHash) {
            throw new BillingError(409, 'CONFLICTING_WEBHOOK_REPLAY', 'Webhook event payload conflict.');
        }
        return { duplicate: true, record };
    }
}

async function processWebhook(payload, headers, rawBody) {
    if (!BILLING_ENABLED || !BILLING_WEBHOOK_PROCESSING_ENABLED) {
        throw new BillingError(503, 'WEBHOOK_PROCESSING_DISABLED', 'Billing webhook processing is disabled.');
    }
    const acquired = await acquireWebhookEvent(payload, headers, rawBody);
    if (acquired.duplicate) return { duplicate: true };
    const occurredAt = new Date(payload.event_time || Date.now());
    const record = acquired.record;

    try {
        if (payload.type === 'SUBSCRIPTION_PAYMENT_SUCCESS') {
            const details = payload.data || {};
            const subscription = await BillingSubscription.findOne({
                providerSubscriptionId: details.subscription_id,
            });
            if (!subscription) throw new BillingError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
            if (details.payment_type === 'CHARGE') {
                if (!details.cf_payment_id) {
                    throw new BillingError(400, 'PAYMENT_ID_MISSING', 'Subscription payment ID is missing.');
                }
                const expected = subscription.offerSnapshot.amountMinor;
                const actual = Math.round(Number(details.payment_amount) * 100);
                if (details.payment_currency !== subscription.offerSnapshot.currency || actual !== expected) {
                    throw new BillingError(409, 'PAYMENT_AMOUNT_MISMATCH', 'Subscription payment mismatch.');
                }
                await grantSubscription(subscription, String(details.cf_payment_id), occurredAt);
            }
            record.resourceId = details.subscription_id;
        } else if (payload.type === 'SUBSCRIPTION_PAYMENT_FAILED') {
            const subscription = await BillingSubscription.findOne({
                providerSubscriptionId: payload.data?.subscription_id,
            });
            if (subscription && subscription.status === 'active') {
                subscription.status = 'past_due';
                subscription.latestProviderEventAt = occurredAt;
                await subscription.save();
            }
        } else if (payload.type === 'SUBSCRIPTION_STATUS_CHANGED') {
            const details = payload.data?.subscription_details || {};
            const subscription = await BillingSubscription.findOne({ providerSubscriptionId: details.subscription_id });
            if (subscription && (!subscription.latestProviderEventAt
                || occurredAt >= subscription.latestProviderEventAt)) {
                const mapped = {
                    ACTIVE: 'active',
                    ON_HOLD: 'past_due',
                    CUSTOMER_PAUSED: 'paused',
                    CUSTOMER_CANCELLED: 'cancelled',
                    CANCELLED: 'cancelled',
                    COMPLETED: 'expired',
                    EXPIRED: 'expired',
                    LINK_EXPIRED: 'failed',
                }[details.subscription_status];
                if (mapped) subscription.status = mapped;
                subscription.latestProviderEventAt = occurredAt;
                await subscription.save();
            }
        } else if (payload.type === 'PAYMENT_SUCCESS_WEBHOOK') {
            const order = payload.data?.order || {};
            const payment = payload.data?.payment || {};
            const purchase = await BillingPurchase.findOne({ providerOrderId: order.order_id });
            if (!purchase) throw new BillingError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found.');
            if (!payment.cf_payment_id) {
                throw new BillingError(400, 'PAYMENT_ID_MISSING', 'Purchase payment ID is missing.');
            }
            const expected = purchase.offerSnapshot.amountMinor;
            const actual = Math.round(Number(payment.payment_amount) * 100);
            if (payment.payment_status !== 'SUCCESS'
                || payment.payment_currency !== purchase.offerSnapshot.currency
                || actual !== expected) {
                throw new BillingError(409, 'PAYMENT_AMOUNT_MISMATCH', 'Purchase payment mismatch.');
            }
            await grantLifetime(purchase, payment.cf_payment_id, occurredAt);
            record.resourceId = order.order_id;
        } else if (payload.type === 'REFUND_STATUS_WEBHOOK') {
            const refund = payload.data?.refund || {};
            const purchase = await BillingPurchase.findOne({ providerOrderId: refund.order_id });
            if (!purchase) throw new BillingError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found.');
            const refundedMinor = Math.round(Number(refund.refund_amount) * 100);
            if (refund.refund_status === 'SUCCESS'
                && refund.refund_currency === purchase.offerSnapshot.currency
                && refundedMinor >= purchase.offerSnapshot.amountMinor) {
                purchase.status = 'refunded';
                purchase.refundedAt = occurredAt;
                await purchase.save();
                await EntitlementGrant.updateMany(
                    { sourceType: 'purchase', sourceId: purchase._id, status: 'active' },
                    { $set: { status: 'revoked', endsAt: occurredAt, reason: 'Verified Cashfree full refund' } }
                );
            }
            record.resourceId = refund.order_id || '';
        } else {
            record.status = 'ignored';
            await record.save();
            return { ignored: true };
        }
        record.status = 'processed';
        await record.save();
        return { processed: true };
    } catch (error) {
        record.status = 'failed';
        record.errorCode = error.code || 'WEBHOOK_PROCESSING_FAILED';
        await record.save();
        throw error;
    }
}

async function cancelSubscription({ userId, subscriptionId, idempotencyKey, requestId }) {
    requireCheckoutConfiguration();
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(idempotencyKey || '')) {
        throw new BillingError(400, 'INVALID_IDEMPOTENCY_KEY', 'A UUID idempotency key is required.');
    }
    const subscription = await BillingSubscription.findOne({ _id: subscriptionId, userId });
    if (!subscription) throw new BillingError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    if (!['pending', 'active', 'past_due', 'paused'].includes(subscription.status)) {
        throw new BillingError(409, 'SUBSCRIPTION_NOT_CANCELLABLE', 'This subscription is not cancellable.');
    }
    await cashfree.cancelSubscription(subscription.providerSubscriptionId, idempotencyKey, requestId);
    subscription.cancelAtPeriodEnd = true;
    subscription.cancelledAt = new Date();
    await subscription.save();
    return billingSummary(userId);
}

module.exports = {
    BillingError,
    listOffers,
    billingSummary,
    createCheckout,
    processWebhook,
    cancelSubscription,
};
