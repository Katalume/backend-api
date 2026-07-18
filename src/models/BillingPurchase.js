const mongoose = require('mongoose');

const billingPurchaseSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    billingCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingCustomer', required: true },
    offerKey: { type: String, required: true, maxlength: 80 },
    offerSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    provider: { type: String, enum: ['cashfree'], required: true },
    providerOrderId: { type: String, required: true, unique: true },
    providerPaymentId: { type: String, default: null },
    checkoutSessionId: { type: String, required: true },
    status: { type: String, enum: ['pending', 'captured', 'failed', 'refunded'], default: 'pending' },
    customerDeleted: { type: Boolean, default: false },
    capturedAt: Date,
    refundedAt: Date,
}, { timestamps: true });

billingPurchaseSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('BillingPurchase', billingPurchaseSchema);
