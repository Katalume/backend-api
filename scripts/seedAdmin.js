/**
 * Create or promote an Admin user.
 *
 * The normal signup flow only allows 'User' / 'Organization', so there is no
 * way to create an Admin through the API. Run this once to bootstrap one:
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_USERNAME=admin ADMIN_PASSWORD='...' \
 *     node scripts/seedAdmin.js
 *
 * If the user already exists, they are promoted to Admin (password unchanged).
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { MONGO_URI } = require('../src/config/env');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

async function run() {
    const email = process.env.ADMIN_EMAIL;
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !username || !password) {
        logger.error('ADMIN_EMAIL, ADMIN_USERNAME and ADMIN_PASSWORD must all be set');
        process.exit(1);
    }
    if (password.length < 8) {
        logger.error('ADMIN_PASSWORD must be at least 8 characters');
        process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    logger.info('Connected to MongoDB');

    try {
        const existing = await User.findOne({ $or: [{ email }, { username }] });

        if (existing) {
            if (existing.roles.includes('Admin')) {
                logger.info(`User ${existing.email} is already an Admin. Nothing to do.`);
            } else {
                existing.roles = Array.from(new Set([...existing.roles, 'Admin']));
                await existing.save();
                logger.info(`Promoted existing user ${existing.email} to Admin.`);
            }
        } else {
            const hashedPassword = await bcrypt.hash(password, await bcrypt.genSalt(10));
            await User.create({ username, email, password: hashedPassword, roles: ['Admin'] });
            logger.info(`Created new Admin user ${email}.`);
        }
    } finally {
        await mongoose.disconnect();
    }
}

run().catch((err) => {
    logger.error('Failed to seed admin:', err);
    process.exit(1);
});
