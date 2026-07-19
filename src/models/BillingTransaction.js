const mongoose = require('mongoose');

const billingTransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    billingCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingCustomer', required: true },
    sourceType: { type: String, enum: ['subscription', 'purchase'], required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    offerKey: { type: String, required: true, maxlength: 80 },
    offerSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    provider: { type: String, enum: ['cashfree'], required: true },
    providerPaymentId: { type: String, required: true, maxlength: 120 },
    providerEventId: { type: String, maxlength: 180, default: '' },
    amountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['INR'], required: true },
    status: { type: String, enum: ['captured', 'refunded'], required: true, index: true },
    occurredAt: { type: Date, required: true },
    refundedMinor: { type: Number, min: 0, default: 0 },
    refundedAt: { type: Date, default: null },
    customerDeleted: { type: Boolean, default: false },
    documentKind: {
        type: String,
        enum: ['payment_receipt'],
        default: 'payment_receipt',
    },
    taxSnapshot: {
        status: { type: String, enum: ['pending_legal_review', 'not_applicable', 'final'], default: 'pending_legal_review' },
        taxInclusive: { type: Boolean, default: null },
        taxMinor: { type: Number, min: 0, default: null },
        gstin: { type: String, maxlength: 20, default: '' },
        invoiceNumber: { type: String, maxlength: 80, default: '' },
    },
}, { timestamps: true });

billingTransactionSchema.index({ provider: 1, providerPaymentId: 1 }, { unique: true });
billingTransactionSchema.index({ userId: 1, occurredAt: -1 });
billingTransactionSchema.index({ sourceType: 1, sourceId: 1, occurredAt: -1 });

module.exports = mongoose.model('BillingTransaction', billingTransactionSchema);
