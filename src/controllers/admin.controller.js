const User = require('../models/User');
const Problem = require('../models/Problem');
const Submission = require('../models/Submission');
const BillingCustomer = require('../models/BillingCustomer');
const BillingSubscription = require('../models/BillingSubscription');
const BillingPurchase = require('../models/BillingPurchase');
const BillingTransaction = require('../models/BillingTransaction');
const BillingWebhookEvent = require('../models/BillingWebhookEvent');
const BillingOperationalAlert = require('../models/BillingOperationalAlert');
const BillingReconciliationRun = require('../models/BillingReconciliationRun');
const { runReconciliation } = require('../billing/reconciliation.service');
const {
    BILLING_ENABLED,
    CHECKOUT_ENABLED,
    BILLING_WEBHOOK_PROCESSING_ENABLED,
    PAID_ENTITLEMENTS_ENFORCED,
    BILLING_RECONCILIATION_ENABLED,
    BILLING_PROVIDER,
    BILLING_ENVIRONMENT,
} = require('../config/env');

exports.getStats = async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        const problemCount = await Problem.countDocuments({ archivedAt: null });
        const submissionCount = await Submission.countDocuments();

        res.json({
            users: userCount,
            problems: problemCount,
            submissions: submissionCount
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getAuditEvents = async (req, res) => {
    const AuditEvent = require('../models/AuditEvent');
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const filter = {};
    if (req.query.before) {
        const before = new Date(req.query.before);
        if (Number.isNaN(before.valueOf())) return res.status(400).json({ message: 'Invalid before cursor' });
        filter.createdAt = { $lt: before };
    }
    const events = await AuditEvent.find(filter)
        .populate('actorId', 'username email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    return res.json(events);
};

function safeLimit(value, fallback = 50) {
    return Math.min(Math.max(Number(value) || fallback, 1), 100);
}

function beforeFilter(value, field = 'createdAt') {
    if (!value) return {};
    const before = new Date(value);
    if (Number.isNaN(before.valueOf())) return null;
    return { [field]: { $lt: before } };
}

exports.getBillingOverview = async (req, res) => {
    try {
        const [
            customers,
            activeSubscriptions,
            capturedPurchases,
            openAlerts,
            failedWebhooks,
            revenue,
            latestRun,
        ] = await Promise.all([
            BillingCustomer.countDocuments(),
            BillingSubscription.countDocuments({ status: { $in: ['active', 'past_due', 'paused'] } }),
            BillingPurchase.countDocuments({ status: 'captured' }),
            BillingOperationalAlert.countDocuments({ status: 'open' }),
            BillingWebhookEvent.countDocuments({ status: 'failed' }),
            BillingTransaction.aggregate([
                { $match: { status: 'captured' } },
                { $group: { _id: '$currency', amountMinor: { $sum: '$amountMinor' }, count: { $sum: 1 } } },
            ]),
            BillingReconciliationRun.findOne().sort({ startedAt: -1 }).lean(),
        ]);
        return res.json({
            counts: {
                customers,
                activeSubscriptions,
                capturedPurchases,
                openAlerts,
                failedWebhooks,
            },
            revenue,
            latestReconciliation: latestRun,
            configuration: {
                billingEnabled: BILLING_ENABLED,
                checkoutEnabled: CHECKOUT_ENABLED,
                webhookProcessingEnabled: BILLING_WEBHOOK_PROCESSING_ENABLED,
                enforcementEnabled: PAID_ENTITLEMENTS_ENFORCED,
                reconciliationEnabled: BILLING_RECONCILIATION_ENABLED,
                provider: BILLING_PROVIDER,
                environment: BILLING_ENVIRONMENT,
            },
        });
    } catch (error) {
        return res.status(500).json({ message: 'Billing overview is temporarily unavailable.' });
    }
};

exports.getBillingCustomers = async (req, res) => {
    try {
        const limit = safeLimit(req.query.limit, 20);
        const query = String(req.query.query || '').trim().slice(0, 120);
        const filter = {};
        if (query) {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.$or = [
                { billingName: { $regex: escaped, $options: 'i' } },
                { billingEmail: { $regex: escaped, $options: 'i' } },
            ];
        }
        const customers = await BillingCustomer.find(filter)
            .sort({ updatedAt: -1 })
            .limit(limit)
            .lean();
        const userIds = customers.map((customer) => customer.userId);
        const [subscriptions, purchases] = await Promise.all([
            BillingSubscription.find({ userId: { $in: userIds } })
                .sort({ createdAt: -1 })
                .select('userId offerKey status currentPeriodEnd cancelAtPeriodEnd')
                .lean(),
            BillingPurchase.find({ userId: { $in: userIds } })
                .sort({ createdAt: -1 })
                .select('userId offerKey status capturedAt refundedAt')
                .lean(),
        ]);
        const latestByUser = (rows) => {
            const map = new Map();
            for (const row of rows) {
                const key = String(row.userId);
                if (!map.has(key)) map.set(key, row);
            }
            return map;
        };
        const subscriptionByUser = latestByUser(subscriptions);
        const purchaseByUser = latestByUser(purchases);
        return res.json({
            customers: customers.map((customer) => ({
                id: String(customer._id),
                userId: String(customer.userId),
                billingName: customer.billingName,
                billingEmail: customer.billingEmail,
                phoneLastFour: customer.billingPhone.slice(-4),
                subscription: subscriptionByUser.get(String(customer.userId)) || null,
                purchase: purchaseByUser.get(String(customer.userId)) || null,
                updatedAt: customer.updatedAt,
            })),
        });
    } catch (error) {
        return res.status(500).json({ message: 'Billing customers are temporarily unavailable.' });
    }
};

exports.getBillingEvents = async (req, res) => {
    const cursor = beforeFilter(req.query.before);
    if (cursor === null) return res.status(400).json({ message: 'Invalid before cursor' });
    const filter = { ...cursor };
    if (req.query.status) {
        const allowed = ['received', 'processing', 'processed', 'ignored', 'failed'];
        if (!allowed.includes(req.query.status)) return res.status(400).json({ message: 'Invalid event status' });
        filter.status = req.query.status;
    }
    const events = await BillingWebhookEvent.find(filter)
        .sort({ createdAt: -1 })
        .limit(safeLimit(req.query.limit))
        .select('-payloadHash')
        .lean();
    return res.json({ events });
};

exports.getBillingAlerts = async (req, res) => {
    const cursor = beforeFilter(req.query.before, 'lastDetectedAt');
    if (cursor === null) return res.status(400).json({ message: 'Invalid before cursor' });
    const filter = { ...cursor };
    if (req.query.status) {
        if (!['open', 'resolved'].includes(req.query.status)) {
            return res.status(400).json({ message: 'Invalid alert status' });
        }
        filter.status = req.query.status;
    }
    const alerts = await BillingOperationalAlert.find(filter)
        .populate('resolvedBy', 'username email')
        .sort({ lastDetectedAt: -1 })
        .limit(safeLimit(req.query.limit))
        .lean();
    return res.json({ alerts });
};

exports.runBillingReconciliation = async (req, res) => {
    try {
        const run = await runReconciliation({ trigger: 'admin', actorId: req.user.id });
        return res.status(201).json(run);
    } catch (error) {
        return res.status(error.status || 500).json({
            code: error.code || 'RECONCILIATION_FAILED',
            message: error.status ? error.message : 'Billing reconciliation failed.',
        });
    }
};

exports.resolveBillingAlert = async (req, res) => {
    try {
        const alert = await BillingOperationalAlert.findOneAndUpdate(
            { _id: req.params.id, status: 'open' },
            { $set: { status: 'resolved', resolvedAt: new Date(), resolvedBy: req.user.id } },
            { returnDocument: 'after', runValidators: true }
        );
        if (!alert) return res.status(404).json({ message: 'Open billing alert not found.' });
        return res.json(alert);
    } catch (error) {
        return res.status(400).json({ message: 'Invalid billing alert.' });
    }
};
