const AuditEvent = require('../models/AuditEvent');
const logger = require('../utils/logger');

function auditAction(action, targetType) {
    return (req, res, next) => {
        const json = res.json.bind(res);
        res.json = (body) => {
            if (res.statusCode < 200 || res.statusCode >= 400 || !req.user?.id) return json(body);
            const targetId = req.params.id || body?._id || body?.id;
            AuditEvent.create({
                actorId: req.user.id,
                action,
                targetType,
                targetId,
                changedFields: Object.keys(req.body || {}).filter((key) => !['password', 'code', 'testcases'].includes(key)),
                requestId: req.requestId,
                ip: req.ip,
                status: res.statusCode,
            })
                .catch((error) => logger.error('Failed to persist admin audit event', {
                    requestId: req.requestId,
                    error,
                }))
                .finally(() => json(body));
            return res;
        };
        next();
    };
}

module.exports = { auditAction };
