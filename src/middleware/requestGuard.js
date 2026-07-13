function containsUnsafeKey(value) {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some(containsUnsafeKey);
    return Object.entries(value).some(([key, child]) => (
        key.startsWith('$') || key.includes('.') || ['__proto__', 'prototype', 'constructor'].includes(key)
            || containsUnsafeKey(child)
    ));
}

function rejectUnsafeInput(req, res, next) {
    if ([req.body, req.query, req.params].some(containsUnsafeKey)) {
        return res.status(400).json({ message: 'Request contains unsafe field names', requestId: req.requestId });
    }
    return next();
}

module.exports = { containsUnsafeKey, rejectUnsafeInput };
