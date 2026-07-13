const jwt = require('jsonwebtoken');
const { JWT_ACCESS_SECRET, JWT_REFRESH_SECRET } = require('../config/env');

const generateAccessToken = (user, sessionId) => {
    return jwt.sign(
        { id: user._id, username: user.username, roles: user.roles, sid: sessionId },
        JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
    );
};

const generateRefreshToken = (user, sessionId) => {
    return jwt.sign(
        { id: user._id, sid: sessionId },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
    );
};

const verifyAccessToken = (token) => {
    return jwt.verify(token, JWT_ACCESS_SECRET);
};

const verifyRefreshToken = (token) => {
    return jwt.verify(token, JWT_REFRESH_SECRET);
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken
};
