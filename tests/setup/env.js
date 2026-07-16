// Runs before any application module is loaded, so env.js reads these values.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.ALLOWED_LANGUAGE_IDS = '50,54,62,63,71';
process.env.MAX_CODE_SIZE = '65536';
// Enable both social providers so the OAuth suite can exercise the full flow.
process.env.GOOGLE_CLIENT_ID = 'test-google-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.GITHUB_CLIENT_ID = 'test-github-id';
process.env.GITHUB_CLIENT_SECRET = 'test-github-secret';
process.env.OAUTH_CALLBACK_BASE_URL = 'https://api.test.katalume.dev';
process.env.FRONTEND_URL = 'https://app.test.katalume.dev';
// Enable the content-import endpoint for its test suite.
process.env.PROBLEMS_IMPORT_TOKEN = 'test-import-token-0123456789abcdef';
