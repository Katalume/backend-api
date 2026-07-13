const axios = require('axios');
const env = require('../config/env');
const User = require('../models/User');
const { resolveUsername } = require('../controllers/auth.controller');

// Static registry of supported social providers. A provider is only usable when
// both its client id and secret are configured, so an unconfigured provider is
// simply invisible (no routes, no button on the web app).
function providerConfigs() {
    return {
        google: {
            name: 'Google',
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenUrl: 'https://oauth2.googleapis.com/token',
            userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
            scope: 'openid email profile',
            authExtra: { access_type: 'online', prompt: 'select_account' },
        },
        github: {
            name: 'GitHub',
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
            authorizeUrl: 'https://github.com/login/oauth/authorize',
            tokenUrl: 'https://github.com/login/oauth/access_token',
            userInfoUrl: 'https://api.github.com/user',
            emailsUrl: 'https://api.github.com/user/emails',
            scope: 'read:user user:email',
            authExtra: {},
        },
    };
}

function isEnabled(cfg) {
    return Boolean(cfg && cfg.clientId && cfg.clientSecret);
}

function getEnabledProviders() {
    const configs = providerConfigs();
    return Object.keys(configs)
        .filter((id) => isEnabled(configs[id]))
        .map((id) => ({ id, name: configs[id].name }));
}

function getProvider(id) {
    const cfg = providerConfigs()[id];
    return isEnabled(cfg) ? cfg : null;
}

function redirectUri(provider) {
    const base = env.OAUTH_CALLBACK_BASE_URL.replace(/\/$/, '');
    return `${base}/api/auth/oauth/${provider}/callback`;
}

function buildAuthorizeUrl(provider, state) {
    const cfg = getProvider(provider);
    if (!cfg) return null;
    const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: redirectUri(provider),
        response_type: 'code',
        scope: cfg.scope,
        state,
        ...cfg.authExtra,
    });
    return `${cfg.authorizeUrl}?${params.toString()}`;
}

async function fetchGoogleProfile(accessToken, cfg) {
    const { data } = await axios.get(cfg.userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
    });
    return {
        providerId: String(data.sub),
        email: (data.email || '').toLowerCase(),
        name: data.name || data.given_name || '',
        avatarUrl: data.picture || '',
        emailVerified: Boolean(data.email_verified),
    };
}

async function fetchGithubProfile(accessToken, cfg) {
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Katalume',
        Accept: 'application/vnd.github+json',
    };
    const { data: profile } = await axios.get(cfg.userInfoUrl, { headers, timeout: 10000 });
    let email = profile.email ? String(profile.email).toLowerCase() : '';
    let emailVerified = false;
    try {
        const { data: emails } = await axios.get(cfg.emailsUrl, { headers, timeout: 10000 });
        const chosen = Array.isArray(emails)
            ? emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified)
            : null;
        if (chosen) {
            email = String(chosen.email).toLowerCase();
            emailVerified = true;
        }
    } catch {
        // user:email scope may be unavailable — fall back to the public profile email
    }
    return {
        providerId: String(profile.id),
        email,
        name: profile.name || profile.login || '',
        avatarUrl: profile.avatar_url || '',
        emailVerified,
    };
}

// Exchange the one-time authorization code for the provider's access token, then
// return a normalized profile: { providerId, email, name, avatarUrl, emailVerified }.
async function exchangeCodeForProfile(provider, code) {
    const cfg = getProvider(provider);
    if (!cfg) {
        const err = new Error('provider_disabled');
        err.code = 'OAUTH_DISABLED';
        throw err;
    }
    const body = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: redirectUri(provider),
        grant_type: 'authorization_code',
    }).toString();
    const tokenResp = await axios.post(cfg.tokenUrl, body, {
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
    });
    const accessToken = tokenResp.data && tokenResp.data.access_token;
    if (!accessToken) {
        const err = new Error('token_exchange_failed');
        err.code = 'OAUTH_TOKEN';
        throw err;
    }
    return provider === 'google'
        ? fetchGoogleProfile(accessToken, cfg)
        : fetchGithubProfile(accessToken, cfg);
}

// Resolve the normalized profile to a Katalume user. There is exactly one account
// per email: a returning social user is matched by (provider, providerId); an
// email already in the system is reused only when the provider verified it (which
// proves ownership and prevents account takeover); otherwise a new passwordless
// account is created.
async function findOrCreateOAuthUser(profile, provider) {
    if (!profile.providerId) {
        const err = new Error('missing_provider_id');
        err.code = 'OAUTH_PROFILE';
        throw err;
    }

    const existingByProvider = await User.findOne({ provider, providerId: profile.providerId });
    if (existingByProvider) return existingByProvider;

    if (!profile.email) {
        const err = new Error('missing_email');
        err.code = 'OAUTH_NO_EMAIL';
        throw err;
    }

    const existingByEmail = await User.findOne({ email: profile.email });
    if (existingByEmail) {
        if (!profile.emailVerified) {
            const err = new Error('email_unverified');
            err.code = 'OAUTH_EMAIL_UNVERIFIED';
            throw err;
        }
        return existingByEmail;
    }

    const username = await resolveUsername({ name: profile.name, email: profile.email });
    return User.create({
        username,
        email: profile.email,
        provider,
        providerId: profile.providerId,
        emailVerified: Boolean(profile.emailVerified),
        avatarUrl: profile.avatarUrl || '',
        roles: ['User'],
    });
}

module.exports = {
    getEnabledProviders,
    getProvider,
    redirectUri,
    buildAuthorizeUrl,
    exchangeCodeForProfile,
    findOrCreateOAuthUser,
};
