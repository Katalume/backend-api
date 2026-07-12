const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { NODE_ENV, COOKIE_DOMAIN, COOKIE_SAME_SITE } = require('../config/env');

const ALLOWED_ROLES = ['User', 'Organization'];
const SESSION_COOKIE = 'mlboost_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sessionCookieOptions() {
    return {
        httpOnly: true,
        secure: NODE_ENV === 'production' || COOKIE_SAME_SITE === 'none',
        sameSite: COOKIE_SAME_SITE,
        maxAge: SESSION_TTL_MS,
        path: '/',
        ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    };
}

function clearSessionCookieOptions() {
    const { maxAge, ...options } = sessionCookieOptions();
    return options;
}

function getSessionToken(req) {
    return req.cookies[SESSION_COOKIE] || req.cookies.refreshToken;
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

// Build a username from an explicit value, a display name, or the email local
// part, then ensure it's unique (appending -2, -3, ... on collision).
async function resolveUsername({ username, name, email }) {
    let base = (username || name || (email || '').split('@')[0] || 'user')
        .toString()
        .trim();
    if (base.length < 3) base = `${base}user`;
    base = base.slice(0, 28);

    let candidate = base;
    let n = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await User.exists({ username: candidate })) {
        n += 1;
        candidate = `${base}-${n}`;
    }
    return candidate;
}

exports.signup = async (req, res) => {
    try {
        const { username, name, email, password, role } = req.body;

        // Role defaults to 'User'; only the two self-service roles are allowed here.
        const selectedRole = role || 'User';
        if (!ALLOWED_ROLES.includes(selectedRole)) {
            return res.status(400).json({ message: "Invalid role. Choose 'User' or 'Organization'." });
        }

        // Reject a duplicate email up front (clearer than a generic 409).
        if (await User.exists({ email })) {
            return res.status(409).json({ message: 'Email already exists' });
        }

        const resolvedUsername = await resolveUsername({ username, name, email });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const newUser = new User({
            username: resolvedUsername,
            email,
            password: hashedPassword,
            roles: [selectedRole]
        });

        await newUser.save();

        // Generate tokens
        const accessToken = generateAccessToken(newUser);
        const refreshToken = generateRefreshToken(newUser);

        res.cookie(SESSION_COOKIE, refreshToken, sessionCookieOptions());

        res.status(201).json({
            message: 'User registered successfully',
            user: publicUser(newUser),
            accessToken
        });

    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user (allow login with email or username if desired, here using email as per plan)
        // Plan said "Email/Username", so let's support both if possible, but for now let's stick to email or check if input looks like email
        const isEmail = email.includes('@');
        const query = isEmail ? { email } : { username: email };
        
        const user = await User.findOne(query);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Validate password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        res.cookie(SESSION_COOKIE, refreshToken, sessionCookieOptions());

        res.status(200).json({
            message: 'Login successful',
            user: publicUser(user),
            accessToken
        });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.refresh = async (req, res) => {
    const refreshToken = getSessionToken(req);

    if (!refreshToken) {
        return res.status(401).json({ message: 'No refresh token provided' });
    }

    try {
        const decoded = verifyRefreshToken(refreshToken);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        const accessToken = generateAccessToken(user);
        // Optionally rotate refresh token here
        
        res.json({ accessToken });

    } catch (error) {
        return res.status(403).json({ message: 'Invalid refresh token' });
    }
};

exports.session = async (req, res) => {
    const token = getSessionToken(req);
    res.set('Cache-Control', 'no-store');
    if (!token) {
        return res.status(401).json({ authenticated: false });
    }
    try {
        const decoded = verifyRefreshToken(token);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ authenticated: false });
        return res.json({ authenticated: true, user: publicUser(user) });
    } catch (error) {
        return res.status(403).json({ authenticated: false });
    }
};

exports.logout = (req, res) => {
    const options = clearSessionCookieOptions();
    res.clearCookie(SESSION_COOKIE, options);
    res.clearCookie('refreshToken', options);
    res.status(204).send();
};

exports.me = async (req, res) => {
    // req.user is set by auth middleware
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};
