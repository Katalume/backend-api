const { verifyAccessToken } = require('../utils/jwt');
const Session = require('../models/Session');
const User = require('../models/User');
const { ALLOW_BEARER_AUTH } = require('../config/env');

function accessToken(req) {
    const authHeader = req.headers.authorization;
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    return req.cookies?.mlboost_access || (ALLOW_BEARER_AUTH ? bearer : null);
}

exports.verifyToken = async (req, res, next) => {
    const token = accessToken(req);

    if (!token) {
        return res.status(401).json({ message: 'Access Token Required' });
    }

    try {
        const decoded = verifyAccessToken(token);
        const [session, user] = decoded.sid ? await Promise.all([
            Session.exists({
                sid: decoded.sid,
                userId: decoded.id,
                revokedAt: null,
                expiresAt: { $gt: new Date() },
            }),
            User.findById(decoded.id).select('username roles').lean(),
        ]) : [null, null];
        if (!session || !user) {
            return res.status(403).json({ message: 'Session Revoked or Expired' });
        }
        decoded.username = user.username;
        decoded.roles = user.roles;
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Invalid or Expired Token' });
    }
};

// Sets req.user when a valid token is present, but never rejects the request.
// Used on public endpoints that return richer data for authenticated users.
exports.optionalAuth = async (req, res, next) => {
    const token = accessToken(req);

    if (token) {
        try {
            const decoded = verifyAccessToken(token);
            const [session, user] = decoded.sid ? await Promise.all([
                Session.exists({
                    sid: decoded.sid,
                    userId: decoded.id,
                    revokedAt: null,
                    expiresAt: { $gt: new Date() },
                }),
                User.findById(decoded.id).select('username roles').lean(),
            ]) : [null, null];
            if (session && user) {
                decoded.username = user.username;
                decoded.roles = user.roles;
                req.user = decoded;
            }
        } catch (error) {
            // Invalid/expired token — proceed as an anonymous request.
        }
    }
    next();
};

exports.authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.roles) {
            return res.status(403).json({ message: 'Access Denied' });
        }

        const hasRole = req.user.roles.some(role => roles.includes(role));
        if (!hasRole) {
            return res.status(403).json({ message: 'Insufficient Permissions' });
        }
        next();
    };
};
