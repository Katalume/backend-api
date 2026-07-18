const mongoose = require('mongoose');

const billingWebhookEventSchema = new mongoose.Schema({
    provider: { type: String, enum: ['cashfree'], required: true },
    providerEventId: { type: String, required: true },
    eventType: { type: String, required: true, maxlength: 100 },
    payloadHash: { type: String, required: true, maxlength: 64 },
    occurredAt: Date,
    status: { type: String, enum: ['received', 'processing', 'processed', 'ignored', 'failed'], required: true },
    processingStartedAt: Date,
    resourceId: { type: String, maxlength: 250, default: '' },
    errorCode: { type: String, maxlength: 100, default: '' },
}, { timestamps: true });

billingWebhookEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });

module.exports = mongoose.model('BillingWebhookEvent', billingWebhookEventSchema);
