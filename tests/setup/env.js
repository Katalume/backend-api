// Runs before any application module is loaded, so env.js reads these values.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.ALLOWED_LANGUAGE_IDS = '50,54,62,63,71';
process.env.MAX_CODE_SIZE = '65536';
