const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mem;

beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
});

afterEach(async () => {
    // Reset all collections between tests for isolation.
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
});

afterAll(async () => {
    await mongoose.disconnect();
    if (mem) {
        await mem.stop();
    }
});
