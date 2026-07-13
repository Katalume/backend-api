const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mem;

beforeAll(async () => {
  // CI hosts and concurrent local checks can take longer than the library's
  // 10-second default to spawn the bundled mongod. Give the process a bounded
  // startup window so infrastructure scheduling does not masquerade as an API
  // regression.
  mem = await MongoMemoryServer.create({
    instance: { launchTimeout: 30_000 },
  });
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
