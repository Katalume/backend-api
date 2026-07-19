const mongoose = require('mongoose');

const billingReconciliationRunSchema = new mongoose.Schema({
    provider: { type: String, enum: ['cashfree', 'disabled'], required: true },
    environment: { type: String, enum: ['sandbox', 'production'], required: true },
    trigger: { type: String, enum: ['scheduled', 'admin'], required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['running', 'succeeded', 'failed'], required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    providerSkipped: { type: Boolean, default: false },
    checked: { type: Number, min: 0, default: 0 },
    matched: { type: Number, min: 0, default: 0 },
    drifted: { type: Number, min: 0, default: 0 },
    providerErrors: { type: Number, min: 0, default: 0 },
    alertsOpened: { type: Number, min: 0, default: 0 },
    alertsResolved: { type: Number, min: 0, default: 0 },
    errorCode: { type: String, maxlength: 100, default: '' },
}, { timestamps: true });

billingReconciliationRunSchema.index(
    { status: 1 },
    { unique: true, partialFilterExpression: { status: 'running' } }
);
billingReconciliationRunSchema.index({ startedAt: -1 });

module.exports = mongoose.model('BillingReconciliationRun', billingReconciliationRunSchema);
