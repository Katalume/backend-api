const crypto = require('crypto');
const BillingSubscription = require('../models/BillingSubscription');
const BillingPurchase = require('../models/BillingPurchase');
const BillingWebhookEvent = require('../models/BillingWebhookEvent');
const BillingTransaction = require('../models/BillingTransaction');
const EntitlementGrant = require('../models/EntitlementGrant');
const BillingOperationalAlert = require('../models/BillingOperationalAlert');
const BillingReconciliationRun = require('../models/BillingReconciliationRun');
const cashfree = require('./providers/cashfree.adapter');
const logger = require('../utils/logger');
const {
    BILLING_ENABLED,
    BILLING_PROVIDER,
    BILLING_ENVIRONMENT,
    BILLING_RECONCILIATION_ENABLED,
    BILLING_RECONCILIATION_INTERVAL_MINUTES,
    BILLING_RECONCILIATION_BATCH_SIZE,
} = require('../config/env');

class ReconciliationError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function fingerprint(kind, resourceType, resourceId) {
    return crypto.createHash('sha256')
        .update(`${kind}:${resourceType}:${resourceId}`)
        .digest('hex');
}

async function openAlert({ kind, severity, resourceType, resourceId, summary, details = {} }) {
    const now = new Date();
    const key = fingerprint(kind, resourceType, resourceId);
    const existing = await BillingOperationalAlert.findOne({ fingerprint: key }).lean();
    await BillingOperationalAlert.findOneAndUpdate(
        { fingerprint: key },
        {
            $set: {
                kind,
                severity,
                status: 'open',
                resourceType,
                resourceId: String(resourceId),
                summary,
                details,
                lastDetectedAt: now,
                resolvedAt: null,
                resolvedBy: null,
            },
            $setOnInsert: { firstDetectedAt: now },
            $inc: { occurrenceCount: existing ? 1 : 0 },
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
    );
    return !existing || existing.status !== 'open';
}

async function resolveAlert(kind, resourceType, resourceId) {
    const result = await BillingOperationalAlert.updateOne(
        { fingerprint: fingerprint(kind, resourceType, resourceId), status: 'open' },
        { $set: { status: 'resolved', resolvedAt: new Date(), resolvedBy: null } }
    );
    return result.modifiedCount || 0;
}

function normalizedProviderSubscriptionStatus(value) {
    return {
        ACTIVE: 'active',
        ON_HOLD: 'past_due',
        CUSTOMER_PAUSED: 'paused',
        CUSTOMER_CANCELLED: 'cancelled',
        CANCELLED: 'cancelled',
        COMPLETED: 'expired',
        EXPIRED: 'expired',
        LINK_EXPIRED: 'failed',
        INITIALIZED: 'pending',
        BANK_APPROVAL_PENDING: 'pending',
    }[String(value || '').toUpperCase()] || null;
}

function normalizedProviderOrderStatus(value) {
    return {
        PAID: 'captured',
        ACTIVE: 'pending',
        EXPIRED: 'failed',
        TERMINATED: 'failed',
    }[String(value || '').toUpperCase()] || null;
}

async function inspectEntitlementSource(sourceType, source, stats) {
    const expectedActive = sourceType === 'subscription'
        ? ['active', 'past_due'].includes(source.status)
        : source.status === 'captured';
    const grant = await EntitlementGrant.findOne({
        sourceType,
        sourceId: source._id,
        status: 'active',
    }).lean();
    const resourceId = String(source._id);

    stats.checked += 1;
    if (expectedActive && !grant) {
        stats.drifted += 1;
        stats.alertsOpened += Number(await openAlert({
            kind: 'missing_entitlement',
            severity: 'critical',
            resourceType: sourceType,
            resourceId,
            summary: `Verified ${sourceType} has no active entitlement grant.`,
            details: { sourceStatus: source.status, offerKey: source.offerKey },
        }));
    } else {
        stats.matched += 1;
        stats.alertsResolved += await resolveAlert('missing_entitlement', sourceType, resourceId);
    }
}

async function inspectOrphanGrant(grant, stats) {
    if (grant.sourceType === 'support') return;
    const SourceModel = grant.sourceType === 'subscription' ? BillingSubscription : BillingPurchase;
    const source = await SourceModel.findById(grant.sourceId).select('status').lean();
    const valid = source && (grant.sourceType === 'subscription'
        ? ['active', 'past_due'].includes(source.status)
        : source.status === 'captured');
    const resourceId = String(grant._id);
    stats.checked += 1;
    if (!valid) {
        stats.drifted += 1;
        stats.alertsOpened += Number(await openAlert({
            kind: 'orphan_entitlement',
            severity: 'critical',
            resourceType: 'entitlement',
            resourceId,
            summary: 'Active entitlement has no matching active billing source.',
            details: {
                sourceType: grant.sourceType,
                sourceId: String(grant.sourceId),
                sourceStatus: source?.status || 'missing',
            },
        }));
    } else {
        stats.matched += 1;
        stats.alertsResolved += await resolveAlert('orphan_entitlement', 'entitlement', resourceId);
    }
}

async function inspectProviderResource(sourceType, source, stats, requestId) {
    const resourceId = String(source._id);
    if (sourceType === 'purchase' && source.status === 'refunded') {
        stats.alertsResolved += await resolveAlert('provider_state_drift', sourceType, resourceId);
        stats.alertsResolved += await resolveAlert('provider_lookup_failed', sourceType, resourceId);
        return;
    }
    try {
        const response = sourceType === 'subscription'
            ? await cashfree.fetchSubscription(source.providerSubscriptionId, requestId)
            : await cashfree.fetchOrder(source.providerOrderId, requestId);
        const providerStatus = sourceType === 'subscription'
            ? normalizedProviderSubscriptionStatus(response.subscription_status)
            : normalizedProviderOrderStatus(response.order_status);
        if (providerStatus && providerStatus !== source.status) {
            stats.drifted += 1;
            stats.alertsOpened += Number(await openAlert({
                kind: 'provider_state_drift',
                severity: 'warning',
                resourceType: sourceType,
                resourceId,
                summary: `Cashfree and Katalume report different ${sourceType} states.`,
                details: { internalStatus: source.status, providerStatus },
            }));
        } else {
            stats.matched += 1;
            stats.alertsResolved += await resolveAlert('provider_state_drift', sourceType, resourceId);
        }
        stats.alertsResolved += await resolveAlert('provider_lookup_failed', sourceType, resourceId);
    } catch (error) {
        stats.providerErrors += 1;
        stats.alertsOpened += Number(await openAlert({
            kind: 'provider_lookup_failed',
            severity: 'warning',
            resourceType: sourceType,
            resourceId,
            summary: `Cashfree ${sourceType} lookup failed during reconciliation.`,
            details: {
                providerStatus: error.response?.status || null,
                code: error.code || 'PROVIDER_LOOKUP_FAILED',
            },
        }));
    }
}

async function inspectWebhooks(stats) {
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    const events = await BillingWebhookEvent.find({
        $or: [
            { status: 'failed' },
            { status: 'processing', processingStartedAt: { $lt: staleBefore } },
        ],
    }).sort({ updatedAt: -1 }).limit(BILLING_RECONCILIATION_BATCH_SIZE).lean();
    for (const event of events) {
        const kind = event.status === 'failed' ? 'failed_webhook' : 'stale_webhook';
        stats.checked += 1;
        stats.drifted += 1;
        stats.alertsOpened += Number(await openAlert({
            kind,
            severity: event.status === 'failed' ? 'critical' : 'warning',
            resourceType: 'webhook',
            resourceId: String(event._id),
            summary: event.status === 'failed'
                ? 'A verified billing webhook failed processing.'
                : 'A billing webhook appears stuck in processing.',
            details: {
                eventType: event.eventType,
                providerEventId: event.providerEventId,
                errorCode: event.errorCode || '',
            },
        }));
    }
    const openWebhookAlerts = await BillingOperationalAlert.find({
        status: 'open',
        kind: { $in: ['failed_webhook', 'stale_webhook'] },
        resourceType: 'webhook',
    }).limit(BILLING_RECONCILIATION_BATCH_SIZE).lean();
    for (const alert of openWebhookAlerts) {
        const event = await BillingWebhookEvent.findById(alert.resourceId).select('status processingStartedAt').lean();
        const stillFailed = alert.kind === 'failed_webhook' && event?.status === 'failed';
        const stillStale = alert.kind === 'stale_webhook'
            && event?.status === 'processing'
            && event.processingStartedAt < staleBefore;
        if (!stillFailed && !stillStale) {
            stats.alertsResolved += await resolveAlert(alert.kind, 'webhook', alert.resourceId);
        }
    }
}

async function backfillMissingTransactions(stats) {
    const sources = await BillingPurchase.find({
        status: { $in: ['captured', 'refunded'] },
        providerPaymentId: { $ne: null },
    }).sort({ updatedAt: -1 }).limit(BILLING_RECONCILIATION_BATCH_SIZE).lean();
    for (const source of sources) {
        const existing = await BillingTransaction.exists({
            provider: 'cashfree',
            providerPaymentId: source.providerPaymentId,
        });
        stats.checked += 1;
        if (existing) {
            stats.matched += 1;
            continue;
        }
        await BillingTransaction.create({
            userId: source.userId,
            billingCustomerId: source.billingCustomerId,
            sourceType: 'purchase',
            sourceId: source._id,
            offerKey: source.offerKey,
            offerSnapshot: source.offerSnapshot,
            provider: 'cashfree',
            providerPaymentId: source.providerPaymentId,
            amountMinor: source.offerSnapshot.amountMinor,
            currency: source.offerSnapshot.currency,
            status: source.status,
            occurredAt: source.capturedAt || source.createdAt,
            refundedMinor: source.status === 'refunded' ? source.offerSnapshot.amountMinor : 0,
            refundedAt: source.refundedAt || null,
        });
        stats.matched += 1;
    }
}

async function runReconciliation({ trigger = 'admin', actorId = null } = {}) {
    let run;
    try {
        run = await BillingReconciliationRun.create({
            provider: BILLING_ENABLED && BILLING_PROVIDER === 'cashfree' ? 'cashfree' : 'disabled',
            environment: BILLING_ENVIRONMENT,
            trigger,
            actorId,
            status: 'running',
            startedAt: new Date(),
            providerSkipped: !(BILLING_ENABLED && BILLING_PROVIDER === 'cashfree'),
        });
    } catch (error) {
        if (error?.code === 11000) {
            throw new ReconciliationError(409, 'RECONCILIATION_ALREADY_RUNNING', 'A reconciliation is already running.');
        }
        throw error;
    }

    const stats = {
        checked: 0,
        matched: 0,
        drifted: 0,
        providerErrors: 0,
        alertsOpened: 0,
        alertsResolved: 0,
    };
    const requestId = `reconcile-${run._id}`;
    try {
        const [subscriptions, purchases, grants] = await Promise.all([
            BillingSubscription.find().sort({ updatedAt: -1 }).limit(BILLING_RECONCILIATION_BATCH_SIZE),
            BillingPurchase.find().sort({ updatedAt: -1 }).limit(BILLING_RECONCILIATION_BATCH_SIZE),
            EntitlementGrant.find({ status: 'active' })
                .sort({ updatedAt: -1 })
                .limit(BILLING_RECONCILIATION_BATCH_SIZE)
                .lean(),
        ]);
        for (const subscription of subscriptions) {
            await inspectEntitlementSource('subscription', subscription, stats);
        }
        for (const purchase of purchases) {
            await inspectEntitlementSource('purchase', purchase, stats);
        }
        for (const grant of grants) {
            await inspectOrphanGrant(grant, stats);
        }
        await inspectWebhooks(stats);
        await backfillMissingTransactions(stats);

        if (!run.providerSkipped) {
            for (const subscription of subscriptions) {
                await inspectProviderResource('subscription', subscription, stats, requestId);
            }
            for (const purchase of purchases) {
                await inspectProviderResource('purchase', purchase, stats, requestId);
            }
        }

        Object.assign(run, stats, { status: 'succeeded', finishedAt: new Date() });
        await run.save();
        return run.toObject();
    } catch (error) {
        Object.assign(run, stats, {
            status: 'failed',
            finishedAt: new Date(),
            errorCode: error.code || 'RECONCILIATION_FAILED',
        });
        await run.save();
        throw error;
    }
}

function startReconciliationScheduler() {
    if (!BILLING_RECONCILIATION_ENABLED) return null;
    const execute = () => runReconciliation({ trigger: 'scheduled' }).catch((error) => {
        if (error.code !== 'RECONCILIATION_ALREADY_RUNNING') {
            logger.error('Billing reconciliation failed', { error });
        }
    });
    const timer = setInterval(execute, BILLING_RECONCILIATION_INTERVAL_MINUTES * 60 * 1000);
    timer.unref();
    setTimeout(execute, 30000).unref();
    logger.info('Billing reconciliation scheduler started', {
        intervalMinutes: BILLING_RECONCILIATION_INTERVAL_MINUTES,
        batchSize: BILLING_RECONCILIATION_BATCH_SIZE,
    });
    return timer;
}

module.exports = {
    ReconciliationError,
    runReconciliation,
    startReconciliationScheduler,
};
