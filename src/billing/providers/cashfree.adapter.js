const axios = require('axios');
const crypto = require('crypto');
const {
    BILLING_ENVIRONMENT,
    CASHFREE_CLIENT_ID,
    CASHFREE_CLIENT_SECRET,
    FRONTEND_URL,
    BILLING_WEBHOOK_URL,
} = require('../../config/env');

const API_VERSION = '2025-01-01';
const baseURL = BILLING_ENVIRONMENT === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

function headers(idempotencyKey, requestId) {
    return {
        'content-type': 'application/json',
        'x-api-version': API_VERSION,
        'x-client-id': CASHFREE_CLIENT_ID,
        'x-client-secret': CASHFREE_CLIENT_SECRET,
        'x-idempotency-key': idempotencyKey,
        ...(requestId ? { 'x-request-id': requestId } : {}),
    };
}

function money(amountMinor) {
    return amountMinor / 100;
}

async function createSubscription({ subscriptionId, offer, customer, idempotencyKey, requestId }) {
    const expiry = new Date();
    expiry.setUTCFullYear(expiry.getUTCFullYear() + 20);
    const firstCharge = new Date(Date.now() + 5 * 60 * 1000);
    const response = await axios.post(`${baseURL}/subscriptions`, {
        subscription_id: subscriptionId,
        customer_details: {
            customer_name: customer.billingName,
            customer_email: customer.billingEmail,
            customer_phone: customer.billingPhone,
        },
        plan_details: {
            plan_name: offer.name,
            plan_type: 'PERIODIC',
            plan_amount: money(offer.amountMinor),
            plan_max_amount: money(offer.amountMinor),
            plan_max_cycles: offer.maxCycles,
            plan_intervals: offer.intervalCount,
            plan_currency: offer.currency,
            plan_interval_type: offer.intervalType,
            plan_note: `${offer.name} access to Katalume`,
        },
        authorization_details: {
            authorization_amount: 1,
            authorization_amount_refund: true,
            payment_methods: ['upi', 'card', 'enach'],
        },
        subscription_meta: {
            return_url: `${FRONTEND_URL}/billing/return?kind=subscription&id=${encodeURIComponent(subscriptionId)}`,
            notification_channel: ['EMAIL', 'SMS'],
        },
        subscription_expiry_time: expiry.toISOString(),
        subscription_first_charge_time: firstCharge.toISOString(),
        subscription_tags: {
            offer_key: offer.offerKey,
        },
    }, { headers: headers(idempotencyKey, requestId), timeout: 15000 });

    return {
        providerSubscriptionId: response.data.subscription_id,
        providerReferenceId: response.data.cf_subscription_id,
        subscriptionSessionId: response.data.subscription_session_id,
        status: response.data.subscription_status,
    };
}

async function createOrder({ orderId, offer, customer, idempotencyKey, requestId }) {
    const response = await axios.post(`${baseURL}/orders`, {
        order_id: orderId,
        order_amount: money(offer.amountMinor),
        order_currency: offer.currency,
        customer_details: {
            customer_id: String(customer.userId),
            customer_name: customer.billingName,
            customer_email: customer.billingEmail,
            customer_phone: customer.billingPhone,
        },
        order_meta: {
            return_url: `${FRONTEND_URL}/billing/return?kind=purchase&id=${encodeURIComponent(orderId)}`,
            notify_url: BILLING_WEBHOOK_URL,
        },
        order_note: `${offer.name} access to Katalume`,
        order_tags: { offer_key: offer.offerKey },
    }, { headers: headers(idempotencyKey, requestId), timeout: 15000 });

    return {
        providerOrderId: response.data.order_id,
        providerReferenceId: response.data.cf_order_id,
        paymentSessionId: response.data.payment_session_id,
        status: response.data.order_status,
    };
}

async function cancelSubscription(providerSubscriptionId, idempotencyKey, requestId) {
    const response = await axios.post(
        `${baseURL}/subscriptions/${encodeURIComponent(providerSubscriptionId)}/manage`,
        { subscription_id: providerSubscriptionId, action: 'CANCEL' },
        { headers: headers(idempotencyKey, requestId), timeout: 15000 }
    );
    return response.data;
}

function verifyWebhook(rawBody, timestamp, signature, now = Date.now()) {
    if (!rawBody || !timestamp || !signature || !CASHFREE_CLIENT_SECRET) return false;
    const timestampMs = Number(timestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60 * 1000) return false;
    const computed = crypto.createHmac('sha256', CASHFREE_CLIENT_SECRET)
        .update(`${timestamp}${rawBody}`)
        .digest('base64');
    const supplied = Buffer.from(signature);
    const expected = Buffer.from(computed);
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

module.exports = {
    createSubscription,
    createOrder,
    cancelSubscription,
    verifyWebhook,
    environment: BILLING_ENVIRONMENT,
};
