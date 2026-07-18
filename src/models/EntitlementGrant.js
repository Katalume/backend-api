const mongoose = require('mongoose');

const entitlementGrantSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tier: { type: String, enum: ['plus', 'lumus'], required: true },
    benefits: [{ type: String, required: true }],
    sourceType: { type: String, enum: ['subscription', 'purchase', 'support'], required: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    reason: { type: String, maxlength: 240, default: '' },
}, { timestamps: true });

entitlementGrantSchema.index({ userId: 1, status: 1, startsAt: 1, endsAt: 1 });
entitlementGrantSchema.index(
    { sourceType: 1, sourceId: 1 },
    { unique: true, partialFilterExpression: { status: 'active' } }
);

module.exports = mongoose.model('EntitlementGrant', entitlementGrantSchema);
