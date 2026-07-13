const crypto = require('crypto');
const User = require('../models/User');
const Session = require('../models/Session');
const bcrypt = require('bcryptjs');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { NODE_ENV, COOKIE_DOMAIN, COOKIE_SAME_SITE } = require('../config/env');

const ALLOWED_ROLES = ['User', 'Organization'];
const SESSION_COOKIE = 'mlboost_session';
const ACCESS_COOKIE = 'mlboost_access';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ACCESS_TTL_MS = 15 * 60 * 1000;

function cookieOptions(maxAge) {
    return {
        httpOnly: true,
        secure: NODE_ENV === 'production' || COOKIE_SAME_SITE === 'none',
        sameSite: COOKIE_SAME_SITE,
        maxAge,
        path: '/',
        ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    };
}

function clearCookieOptions() {
    const { maxAge, ...options } = cookieOptions(0);
    return options;
}

function getSessionToken(req) {
    return req.cookies[SESSION_COOKIE] || req.cookies.refreshToken;
}

function tokenHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function publicUser(user) {
    return {
        id: user._id,
        username: user.username,
        email: user.email,
        roles: user.roles,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
    };
}

async function createSession(user, req) {
    const sid = crypto.randomUUID();
    const refreshToken = generateRefreshToken(user, sid);
    await Session.create({
        sid,
        userId: user._id,
        refreshTokenHash: tokenHash(refreshToken),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        userAgent: String(req.get('user-agent') || '').slice(0, 512),
        ip: String(req.ip || '').slice(0, 128),
    });
    return { sid, refreshToken, accessToken: generateAccessToken(user, sid) };
}

function setSessionCookies(res, tokens) {
    res.cookie(SESSION_COOKIE, tokens.refreshToken, cookieOptions(SESSION_TTL_MS));
    res.cookie(ACCESS_COOKIE, tokens.accessToken, cookieOptions(ACCESS_TTL_MS));
}

function developmentToken(tokens) {
    return NODE_ENV === 'production' ? {} : { accessToken: tokens.accessToken };
}

async function resolveUsername({ username, name, email }) {
    let base = (username || name || (email || '').split('@')[0] || 'user').toString().trim();
    if (base.length < 3) base = `${base}user`;
    base = base.slice(0, 28);
    let candidate = base;
    let n = 1;
    while (await User.exists({ username: candidate })) {
        n += 1;
        candidate = `${base}-${n}`;
    }
    return candidate;
}

exports.signup = async (req, res) => {
    try {
        const { username, name, email, password, role } = req.body;
        const selectedRole = role || 'User';
        if (!ALLOWED_ROLES.includes(selectedRole)) {
            return res.status(400).json({ message: "Invalid role. Choose 'User' or 'Organization'." });
        }
        if (await User.exists({ email })) return res.status(409).json({ message: 'Email already exists' });
        const resolvedUsername = await resolveUsername({ username, name, email });
        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await User.create({
            username: resolvedUsername,
            email,
            password: hashedPassword,
            roles: [selectedRole],
        });
        const tokens = await createSession(user, req);
        setSessionCookies(res, tokens);
        return res.status(201).json({
            message: 'User registered successfully',
            user: publicUser(user),
            ...developmentToken(tokens),
        });
    } catch (error) {
        if (error?.code === 11000) return res.status(409).json({ message: 'Email or username already exists' });
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const query = email.includes('@') ? { email } : { username: email };
        const user = await User.findOne(query);
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const tokens = await createSession(user, req);
        setSessionCookies(res, tokens);
        return res.json({ message: 'Login successful', user: publicUser(user), ...developmentToken(tokens) });
    } catch (error) {
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.refresh = async (req, res) => {
    const refreshToken = getSessionToken(req);
    if (!refreshToken) return res.status(401).json({ message: 'No refresh token provided' });
    try {
        const decoded = verifyRefreshToken(refreshToken);
        if (!decoded.sid) return res.status(403).json({ message: 'Invalid refresh token' });
        const session = await Session.findOne({ sid: decoded.sid, userId: decoded.id });
        if (!session || session.expiresAt <= new Date()) return res.status(403).json({ message: 'Invalid refresh token' });
        if (session.revokedAt || session.refreshTokenHash !== tokenHash(refreshToken)) {
            await Session.updateMany({ userId: decoded.id, revokedAt: null }, { revokedAt: new Date() });
            return res.status(403).json({ message: 'Refresh token reuse detected' });
        }
        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ message: 'User not found' });

        const replacement = await createSession(user, req);
        const revoked = await Session.updateOne({ _id: session._id, revokedAt: null }, {
            revokedAt: new Date(),
            replacedBy: replacement.sid,
            lastUsedAt: new Date(),
        });
        if (revoked.modifiedCount !== 1) {
            await Session.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
            return res.status(403).json({ message: 'Refresh token reuse detected' });
        }
        setSessionCookies(res, replacement);
        return res.json({ user: publicUser(user), ...developmentToken(replacement) });
    } catch (error) {
        return res.status(403).json({ message: 'Invalid refresh token' });
    }
};

exports.session = async (req, res) => {
    const token = getSessionToken(req);
    res.set('Cache-Control', 'no-store');
    if (!token) return res.status(401).json({ authenticated: false });
    try {
        const decoded = verifyRefreshToken(token);
        const [session, user] = await Promise.all([
            Session.findOne({ sid: decoded.sid, userId: decoded.id, revokedAt: null }),
            User.findById(decoded.id),
        ]);
        if (!session || session.expiresAt <= new Date() || !user || session.refreshTokenHash !== tokenHash(token)) {
            return res.status(401).json({ authenticated: false });
        }
        return res.json({ authenticated: true, user: publicUser(user) });
    } catch (error) {
        return res.status(401).json({ authenticated: false });
    }
};

exports.logout = async (req, res) => {
    const token = getSessionToken(req);
    if (token) {
        try {
            const decoded = verifyRefreshToken(token);
            await Session.updateOne({ sid: decoded.sid }, { revokedAt: new Date() });
        } catch (error) {
            // Cookie clearing is still safe when the supplied token is invalid.
        }
    }
    const options = clearCookieOptions();
    res.clearCookie(SESSION_COOKIE, options);
    res.clearCookie(ACCESS_COOKIE, options);
    res.clearCookie('refreshToken', options);
    return res.status(204).send();
};

exports.logoutAll = async (req, res) => {
    await Session.updateMany({ userId: req.user.id, revokedAt: null }, { revokedAt: new Date() });
    const options = clearCookieOptions();
    res.clearCookie(SESSION_COOKIE, options);
    res.clearCookie(ACCESS_COOKIE, options);
    return res.status(204).send();
};

exports.me = async (req, res) => {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
};

exports.changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({ message: 'Current password and a new password of at least 8 characters are required' });
    }
    const user = await User.findById(req.user.id);
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
        return res.status(401).json({ message: 'Current password is incorrect' });
    }
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    await Session.updateMany({
        userId: user._id,
        sid: { $ne: req.user.sid },
        revokedAt: null,
    }, { revokedAt: new Date() });
    return res.status(204).send();
};

exports.exportAccount = async (req, res) => {
    const Submission = require('../models/Submission');
    const Contest = require('../models/Contest');
    const [user, submissions, contests] = await Promise.all([
        User.findById(req.user.id).select('-password').lean(),
        Submission.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean(),
        Contest.find({ participants: req.user.id }).select('title startTime endTime').lean(),
    ]);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.set('Content-Disposition', 'attachment; filename="mlboost-account-export.json"');
    return res.json({ exportedAt: new Date().toISOString(), user, submissions, contests });
};

exports.deleteAccount = async (req, res) => {
    const { password } = req.body || {};
    const user = await User.findById(req.user.id);
    if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ message: 'Password confirmation failed' });
    }
    await require('../services/account.service').deleteUserData(user._id);
    const options = clearCookieOptions();
    res.clearCookie(SESSION_COOKIE, options);
    res.clearCookie(ACCESS_COOKIE, options);
    return res.status(204).send();
};
