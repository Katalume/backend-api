const mongoose = require('mongoose');

const billingSubscriptionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    billingCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingCustomer', required: true },
    offerKey: { type: String, required: true, maxlength: 80 },
    offerSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    provider: { type: String, enum: ['cashfree'], required: true },
    providerSubscriptionId: { type: String, required: true, unique: true },
    providerReferenceId: { type: String, default: null },
    checkoutSessionId: { type: String, required: true },
    status: {
        type: String,
        enum: ['pending', 'active', 'past_due', 'paused', 'cancelled', 'expired', 'failed'],
        default: 'pending',
        index: true,
    },
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    processedPaymentIds: [{ type: String, maxlength: 120 }],
    cancelAtPeriodEnd: { type: Boolean, default: false },
    customerDeleted: { type: Boolean, default: false },
    cancelledAt: Date,
    latestProviderEventAt: Date,
}, { timestamps: true });

billingSubscriptionSchema.index({ userId: 1, status: 1, currentPeriodEnd: -1 });

module.exports = mongoose.model('BillingSubscription', billingSubscriptionSchema);
