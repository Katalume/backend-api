const express = require('express');
const router = express.Router();
const oauth = require('../controllers/oauth.controller');

// Public social-login endpoints. These are intentionally kept off the strict
// auth brute-force limiter: /providers is a harmless read hit on every login
// page load, and the OAuth redirects are legitimate top-level navigations.
router.get('/providers', oauth.providers);
router.get('/oauth/:provider', oauth.start);
router.get('/oauth/:provider/callback', oauth.callback);

module.exports = router;
