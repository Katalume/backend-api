const cashfree = require('../billing/providers/cashfree.adapter');
const billing = require('../billing/billing.service');

function sendError(res, error) {
    const status = error.status || 500;
    return res.status(status).json({
        code: error.code || 'BILLING_ERROR',
        message: status >= 500 ? 'Billing is temporarily unavailable. No charge was made.' : error.message,
    });
}

exports.offers = (req, res) => res.json(billing.listOffers());

exports.summary = async (req, res) => {
    try {
        return res.json(await billing.billingSummary(req.user.id));
    } catch (error) {
        return sendError(res, error);
    }
};

exports.checkout = async (req, res) => {
    try {
        const result = await billing.createCheckout({
            userId: req.user.id,
            offerKey: req.body.offerKey,
            phone: req.body.phone,
            idempotencyKey: req.get('idempotency-key'),
            requestId: req.requestId,
        });
        return res.status(201).json(result);
    } catch (error) {
        return sendError(res, error);
    }
};

exports.cancel = async (req, res) => {
    try {
        const result = await billing.cancelSubscription({
            userId: req.user.id,
            subscriptionId: req.params.id,
            idempotencyKey: req.get('idempotency-key'),
            requestId: req.requestId,
        });
        return res.json(result);
    } catch (error) {
        return sendError(res, error);
    }
};

exports.cashfreeWebhook = async (req, res) => {
    try {
        const rawBody = req.rawBody;
        const signature = req.get('x-webhook-signature');
        const timestamp = req.get('x-webhook-timestamp');
        if (!cashfree.verifyWebhook(rawBody, timestamp, signature)) {
            return res.status(400).json({ code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Invalid webhook signature.' });
        }
        const result = await billing.processWebhook(req.body, req.headers, rawBody);
        return res.status(200).json(result);
    } catch (error) {
        return sendError(res, error);
    }
};
