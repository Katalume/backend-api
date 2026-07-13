const mongoose = require('mongoose');

const auditEventSchema = new mongoose.Schema({
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorDeleted: { type: Boolean, default: false },
    action: { type: String, required: true, maxlength: 120 },
    targetType: { type: String, required: true, maxlength: 80 },
    targetId: { type: String, maxlength: 128 },
    changedFields: [{ type: String, maxlength: 80 }],
    requestId: { type: String, maxlength: 128 },
    ip: { type: String, maxlength: 128 },
    status: Number,
    expiresAt: { type: Date, default: () => new Date(Date.now() + 365 * 86400000) },
}, { timestamps: true });

auditEventSchema.index({ actorId: 1, createdAt: -1 });
auditEventSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuditEvent', auditEventSchema);
