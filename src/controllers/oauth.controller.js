const crypto = require('crypto');
const { NODE_ENV, COOKIE_DOMAIN, FRONTEND_URL } = require('../config/env');
const oauthService = require('../services/oauth.service');
const { createSession, setSessionCookies } = require('./auth.controller');

const STATE_COOKIE = 'katalume_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

// The state cookie must survive the top-level redirect back from the provider,
// so it is SameSite=Lax (Strict would drop it on the cross-site callback).
function stateCookieOptions(maxAge) {
    return {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge,
        path: '/',
        ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    };
}

function appRedirect(pathAndQuery) {
    const base = FRONTEND_URL.replace(/\/$/, '');
    return `${base}${pathAndQuery}`;
}

// GET /api/auth/providers — which social logins the web app should offer.
exports.providers = (req, res) => {
    return res.json({ providers: oauthService.getEnabledProviders() });
};

// GET /api/auth/oauth/:provider — begin the OAuth flow.
exports.start = (req, res) => {
    const { provider } = req.params;
    if (!oauthService.getProvider(provider)) {
        return res.redirect(appRedirect('/login?error=oauth_unavailable'));
    }
    const state = crypto.randomBytes(24).toString('hex');
    res.cookie(STATE_COOKIE, `${provider}:${state}`, stateCookieOptions(STATE_TTL_MS));
    return res.redirect(oauthService.buildAuthorizeUrl(provider, state));
};

// GET /api/auth/oauth/:provider/callback — provider redirects here with ?code&state.
exports.callback = async (req, res) => {
    const { provider } = req.params;
    const { code, state, error: providerError } = req.query;
    const { [STATE_COOKIE]: stateCookie } = req.cookies;
    res.clearCookie(STATE_COOKIE, { ...stateCookieOptions(0), maxAge: undefined });

    if (providerError) {
        return res.redirect(appRedirect('/login?error=oauth_denied'));
    }
    if (!oauthService.getProvider(provider)) {
        return res.redirect(appRedirect('/login?error=oauth_unavailable'));
    }
    // CSRF: the state returned by the provider must match the one we stored, and
    // it must belong to this provider.
    if (!code || !state || !stateCookie || stateCookie !== `${provider}:${state}`) {
        return res.redirect(appRedirect('/login?error=oauth_state'));
    }

    try {
        const profile = await oauthService.exchangeCodeForProfile(provider, String(code));
        const user = await oauthService.findOrCreateOAuthUser(profile, provider);
        const tokens = await createSession(user, req);
        setSessionCookies(res, tokens);
        // Land on a protected route so the server validates the new session
        // before rendering. Redirecting to the public homepage can briefly
        // show the signed-out landing shell while the client session loads.
        return res.redirect(appRedirect('/problems'));
    } catch (err) {
        const reason = err && err.code === 'OAUTH_EMAIL_UNVERIFIED' ? 'oauth_email' : 'oauth_failed';
        return res.redirect(appRedirect(`/login?error=${reason}`));
    }
};
