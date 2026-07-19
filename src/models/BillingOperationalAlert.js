const mongoose = require('mongoose');

const billingOperationalAlertSchema = new mongoose.Schema({
    fingerprint: { type: String, required: true, unique: true, maxlength: 220 },
    kind: {
        type: String,
        enum: [
            'missing_entitlement',
            'orphan_entitlement',
            'provider_state_drift',
            'provider_lookup_failed',
            'failed_webhook',
            'stale_webhook',
        ],
        required: true,
        index: true,
    },
    severity: { type: String, enum: ['info', 'warning', 'critical'], required: true, index: true },
    status: { type: String, enum: ['open', 'resolved'], default: 'open', index: true },
    resourceType: { type: String, enum: ['subscription', 'purchase', 'webhook', 'entitlement'], required: true },
    resourceId: { type: String, required: true, maxlength: 180 },
    summary: { type: String, required: true, maxlength: 300 },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    firstDetectedAt: { type: Date, required: true },
    lastDetectedAt: { type: Date, required: true },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    occurrenceCount: { type: Number, min: 1, default: 1 },
}, { timestamps: true });

billingOperationalAlertSchema.index({ status: 1, severity: 1, lastDetectedAt: -1 });

module.exports = mongoose.model('BillingOperationalAlert', billingOperationalAlertSchema);
