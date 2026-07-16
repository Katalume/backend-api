/**
 * Shared seed routine. Assumes an active mongoose connection.
 * Idempotent: upserts by slug so it can run repeatedly.
 */
const Problem = require('../src/models/Problem');
const Testcase = require('../src/models/Testcase');
const Contest = require('../src/models/Contest');
const LearningTrack = require('../src/models/LearningTrack');
const logger = require('../src/utils/logger');

const PROBLEMS = require('../data/problem-catalog.json');

const LEARNING_TRACKS = [
    {
        slug: 'ml-foundations',
        title: 'ML Foundations',
        description: 'Linear models, overfitting, feature scaling, and evaluation.',
        tags: ['regression', 'optimization', 'classification'],
        order: 1,
        lessons: ['Bias-Variance Tradeoff', 'Confusion Matrix and F1', 'Regularization in Practice'],
    },
    {
        slug: 'pandas-for-interviews',
        title: 'Pandas for Interviews',
        description: 'Joins, groupby, window operations, and common data transforms.',
        tags: ['data-preprocessing'],
        order: 2,
        lessons: ['GroupBy Deep Dive', 'Joins and Merges', 'Window Functions'],
    },
];

async function seedProblems() {
    for (const spec of PROBLEMS) {
        const existing = await Problem.findOne({ slug: spec.slug });
        const { testcases, ...problemData } = spec;
        if (existing?.contentVersion === spec.contentVersion) continue;
        const problem = existing || await Problem.create({ ...problemData, testcaseVersion: 1 });
        const nextVersion = existing ? existing.testcaseVersion + 1 : 1;
        let inserted = [];
        try {
            inserted = await Testcase.insertMany((testcases || []).map((testcase) => ({
                ...testcase,
                problemId: problem._id,
                version: nextVersion,
            })));
            if (existing) {
                const switched = await Problem.updateOne({
                    _id: problem._id,
                    contentVersion: existing.contentVersion,
                    testcaseVersion: existing.testcaseVersion,
                }, {
                    $set: { ...problemData, testcaseVersion: nextVersion },
                });
                if (switched.modifiedCount !== 1) throw new Error(`Concurrent content update: ${spec.slug}`);
            }
            await Testcase.deleteMany({ problemId: problem._id, version: { $ne: nextVersion } });
        } catch (error) {
            if (inserted.length) await Testcase.deleteMany({ _id: { $in: inserted.map((item) => item._id) } });
            if (!existing) await Problem.deleteOne({ _id: problem._id });
            throw error;
        }
        logger.info(`Seeded problem: ${spec.slug}`);
    }
}

async function seedContests() {
    const now = Date.now();
    const HOUR = 60 * 60 * 1000;
    const problemIds = await Problem.find({ slug: { $in: PROBLEMS.map((problem) => problem.slug) } }).distinct('_id');
    const contests = [
        {
            title: 'Model Metrics Championship',
            description: 'Solve three evaluation-heavy challenges under 75 minutes.',
            startTime: new Date(now - HOUR),
            endTime: new Date(now + HOUR),
            problems: problemIds,
        },
        {
            title: 'Feature Engineering Arena',
            description: 'Timed feature-engineering gauntlet.',
            startTime: new Date(now + 3 * HOUR),
            endTime: new Date(now + 5 * HOUR),
            problems: problemIds,
        },
    ];
    for (const contest of contests) {
        const { startTime, endTime, ...currentContent } = contest;
        await Contest.findOneAndUpdate({ title: contest.title }, {
            $set: currentContent,
            $setOnInsert: { startTime, endTime },
        }, { upsert: true, setDefaultsOnInsert: true });
    }
    logger.info('Seeded contests');
}

async function seedLearningTracks() {
    for (const track of LEARNING_TRACKS) {
        await LearningTrack.findOneAndUpdate({ slug: track.slug }, track, {
            upsert: true,
            setDefaultsOnInsert: true,
        });
    }
    logger.info('Seeded learning tracks');
}

async function seedAll() {
    await seedProblems();
    await seedContests();
    await seedLearningTracks();
}

module.exports = { seedAll, PROBLEMS, LEARNING_TRACKS };

// Allow running directly against a real database: `npm run seed`.
if (require.main === module) {
    const mongoose = require('mongoose');
    const { MONGO_URI } = require('../src/config/env');
    mongoose
        .connect(MONGO_URI)
        .then(seedAll)
        .then(() => mongoose.disconnect())
        .then(() => process.exit(0))
        .catch((err) => {
            logger.error('Seed failed:', err);
            process.exit(1);
        });
}
