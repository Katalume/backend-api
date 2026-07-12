/**
 * Run the full API against an in-memory MongoDB — no external database needed.
 *   npm run dev:memory
 * Seeds problems, contests, and learning tracks, and allows the frontend dev
 * origins through CORS. Intended for local development / demos only.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

async function main() {
    const mem = await MongoMemoryServer.create();

    // These must be set before requiring the app (env.js reads them at load).
    process.env.MONGO_URI = mem.getUri();
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev_access_secret';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret';
    process.env.CORS_ORIGIN =
        process.env.CORS_ORIGIN ||
        'http://localhost:3000,http://localhost:3010,http://localhost:5173';

    await mongoose.connect(process.env.MONGO_URI);

    const { seedAll } = require('./seedData');
    await seedAll();

    // Dev-only: ensure a known admin exists so the admin UI is testable locally.
    // Never do this against a real database.
    const bcrypt = require('bcryptjs');
    const User = require('../src/models/User');
    const ADMIN_EMAIL = 'admin@mlboost.dev';
    const ADMIN_PASSWORD = 'adminpass123';
    if (!(await User.exists({ email: ADMIN_EMAIL }))) {
        await User.create({
            username: 'admin',
            email: ADMIN_EMAIL,
            password: await bcrypt.hash(ADMIN_PASSWORD, 10),
            roles: ['Admin'],
        });
    }
    // eslint-disable-next-line no-console
    console.log(`[dev:memory] admin login → ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

    // require after env + connection are ready; app does not auto-listen here.
    const app = require('../src/app');
    const { BACKEND_PORT } = require('../src/config/env');

    const server = app.listen(BACKEND_PORT, () => {
        // eslint-disable-next-line no-console
        console.log(`[dev:memory] API listening on http://localhost:${BACKEND_PORT} (in-memory Mongo)`);
    });

    const shutdown = async () => {
        server.close();
        await mongoose.disconnect();
        await mem.stop();
        process.exit(0);
    };
    ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, shutdown));
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[dev:memory] failed to start:', err);
    process.exit(1);
});
