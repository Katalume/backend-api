module.exports = {
    testEnvironment: 'node',
    setupFiles: ['<rootDir>/tests/setup/env.js'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup/db.js'],
    testMatch: ['<rootDir>/tests/**/*.test.js'],
    testTimeout: 60000,
    // In-memory Mongo uses one shared connection; run serially.
    maxWorkers: 1,
};
