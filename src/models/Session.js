const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    sid: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    replacedBy: String,
    lastUsedAt: { type: Date, default: Date.now },
    userAgent: { type: String, maxlength: 512 },
    ip: { type: String, maxlength: 128 },
}, { timestamps: true });

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, revokedAt: 1 });

module.exports = mongoose.model('Session', sessionSchema);
