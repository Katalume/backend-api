const mongoose = require('mongoose');

const billingCustomerSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, enum: ['cashfree'], required: true },
    billingName: { type: String, required: true, trim: true, maxlength: 120 },
    billingEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    billingPhone: { type: String, required: true, match: /^[6-9]\d{9}$/ },
}, { timestamps: true });

billingCustomerSchema.index({ userId: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model('BillingCustomer', billingCustomerSchema);
