const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const logger = require('../src/utils/logger');
const Submission = require('../src/models/Submission');
const Leaderboard = require('../src/models/Leaderboard');

// Load every indexed model before createIndexes runs.
const indexedModels = [
    require('../src/models/User'),
    require('../src/models/Session'),
    require('../src/models/Problem'),
    require('../src/models/Testcase'),
    Submission,
    require('../src/models/Contest'),
    Leaderboard,
    require('../src/models/EvaluationJob'),
    require('../src/models/LearningTrack'),
    require('../src/models/AuditEvent'),
];

async function deduplicateLeaderboards() {
    const duplicateGroups = await Leaderboard.aggregate([
        { $group: { _id: { contestId: '$contestId', userId: '$userId' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
    ]);
    for (const group of duplicateGroups) {
        const rows = await Leaderboard.find({ _id: { $in: group.ids } }).lean();
        const keep = rows[0];
        const solved = [...new Set(rows.flatMap((row) => row.problemsSolved.map(String)))];
        const lastSubmissionTime = rows
            .map((row) => row.lastSubmissionTime)
            .filter(Boolean)
            .sort((a, b) => new Date(a) - new Date(b))[0];
        await Leaderboard.updateOne({ _id: keep._id }, {
            score: solved.length,
            problemsSolved: solved,
            lastSubmissionTime,
        });
        await Leaderboard.deleteMany({ _id: { $in: rows.slice(1).map((row) => row._id) } });
    }
}

async function migrate() {
    await connectDB();
    await Submission.updateMany({ status: 'Pending' }, {
        status: 'Internal Error',
        errorMessage: 'Legacy evaluation did not reach a terminal verdict',
    });
    await require('../src/models/Testcase').updateMany(
        { version: { $exists: false } },
        { $set: { version: 1 } }
    );
    await deduplicateLeaderboards();
    for (const model of indexedModels) await model.createIndexes();
    logger.info('Database migration completed', { models: indexedModels.map((model) => model.modelName) });
    await mongoose.connection.close();
}

if (require.main === module) {
    migrate().catch((error) => {
        logger.error('Database migration failed', { error });
        process.exit(1);
    });
}

module.exports = { migrate, deduplicateLeaderboards };
