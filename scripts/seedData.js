/**
 * Shared seed routine. Assumes an active mongoose connection.
 * Idempotent: upserts by slug so it can run repeatedly.
 */
const Problem = require('../src/models/Problem');
const Testcase = require('../src/models/Testcase');
const Contest = require('../src/models/Contest');
const LearningTrack = require('../src/models/LearningTrack');
const logger = require('../src/utils/logger');

const PROBLEMS = [
    {
        contentVersion: 2,
        slug: 'knn-classifier-iris',
        title: 'KNN Classifier on Iris',
        difficulty: 'Easy',
        tags: ['scikit-learn', 'classification', 'knn'],
        description:
            'Read one JSON object from stdin containing X_train, y_train, X_test, and k. Implement solve(payload) using Euclidean K-Nearest Neighbors with deterministic majority voting. Print the prediction list as compact JSON.',
        constraints: ['1 <= k <= len(X_train)', 'All rows have equal dimensions.', 'Break vote ties by choosing the numerically smallest label.'],
        starterCode: `import json
import math
import sys

def solve(payload):
    X_train = payload["X_train"]
    y_train = payload["y_train"]
    X_test = payload["X_test"]
    k = payload["k"]
    # Return one integer prediction for every row in X_test.
    raise NotImplementedError

if __name__ == "__main__":
    payload = json.loads(sys.stdin.read())
    print(json.dumps(solve(payload), separators=(",", ":")))`,
        sampleTestCases: [
            { input: '{"X_train":[[5.1,3.5],[6.5,3.0]],"y_train":[0,1],"X_test":[[5.0,3.4]],"k":1}', output: '[0]' },
        ],
        editorial: {
            summary: 'Brute-force nearest neighbours with deterministic tie-breaking.',
            approach: 'Compute distances, sort, take top-k, majority vote.',
            timeComplexity: 'O(n*m*d)',
            spaceComplexity: 'O(n)',
            pitfalls: ['Non-deterministic tie-breaking.'],
        },
        testcases: [
            { input: '{"X_train":[[5.1,3.5],[6.5,3.0]],"y_train":[0,1],"X_test":[[5.0,3.4]],"k":1}', expectedOutput: '[0]', isPublic: true, timeLimit: 2, memoryLimit: 128000 },
            { input: '{"X_train":[[0,0],[0,2],[2,0],[2,2]],"y_train":[0,0,1,1],"X_test":[[1.8,0.1],[0.1,1.8]],"k":1}', expectedOutput: '[1,0]', isPublic: false, timeLimit: 2, memoryLimit: 128000 },
        ],
    },
    {
        contentVersion: 2,
        slug: 'standardize-dataset',
        title: 'Standardize a Dataset',
        difficulty: 'Easy',
        tags: ['data-preprocessing', 'numpy'],
        description: 'Read a JSON object with matrix X from stdin. Standardize every column using population standard deviation, return 0.0 for zero-variance columns, round to four decimals, and print compact JSON.',
        constraints: ['1 <= rows, columns <= 500', 'All rows have equal length.', 'Use population standard deviation (divide variance by n).'],
        starterCode: `import json
import math
import sys

def solve(payload):
    X = payload["X"]
    # Return the standardized matrix rounded to four decimals.
    raise NotImplementedError

if __name__ == "__main__":
    payload = json.loads(sys.stdin.read())
    print(json.dumps(solve(payload), separators=(",", ":")))`,
        sampleTestCases: [{ input: '{"X":[[1,2],[3,4]]}', output: '[[-1.0,-1.0],[1.0,1.0]]' }],
        editorial: {
            summary: 'Subtract the mean and divide by the standard deviation per column.',
            approach: 'Compute column mean/std, apply (x-mean)/std.',
            timeComplexity: 'O(n*d)',
            spaceComplexity: 'O(n*d)',
            pitfalls: ['Dividing by zero std.'],
        },
        testcases: [
            { input: '{"X":[[1,2],[3,4]]}', expectedOutput: '[[-1.0,-1.0],[1.0,1.0]]', isPublic: true, timeLimit: 2, memoryLimit: 128000 },
            { input: '{"X":[[5,1],[5,2],[5,3]]}', expectedOutput: '[[0.0,-1.2247],[0.0,0.0],[0.0,1.2247]]', isPublic: false, timeLimit: 2, memoryLimit: 128000 },
        ],
    },
    {
        contentVersion: 2,
        slug: 'linear-regression-gd',
        title: 'Linear Regression via Gradient Descent',
        difficulty: 'Medium',
        tags: ['regression', 'optimization', 'numpy'],
        description:
            'Read a JSON object with one-dimensional X, y, lr, and epochs. Train y = w*x + b by full-batch gradient descent on mean squared error, starting from w=b=0. Print compact JSON with w and b rounded to four decimals.',
        constraints: ['1 <= len(X) == len(y) <= 10000', '0 < lr <= 0.1', '1 <= epochs <= 20000'],
        starterCode: `import json
import sys

def solve(payload):
    X, y = payload["X"], payload["y"]
    lr, epochs = payload["lr"], payload["epochs"]
    w = b = 0.0
    # Apply full-batch MSE gradients and return {"w": ..., "b": ...}.
    raise NotImplementedError

if __name__ == "__main__":
    payload = json.loads(sys.stdin.read())
    print(json.dumps(solve(payload), separators=(",", ":"), sort_keys=True))`,
        sampleTestCases: [{ input: '{"X":[1,2,3],"y":[3,5,7],"lr":0.1,"epochs":1000}', output: '{"b":1.0,"w":2.0}' }],
        editorial: {
            summary: 'Batch gradient descent on MSE.',
            approach: 'Update w and b using MSE gradients each epoch.',
            timeComplexity: 'O(epochs*n)',
            spaceComplexity: 'O(1)',
            pitfalls: ['Learning rate too high diverges.'],
        },
        testcases: [
            { input: '{"X":[1,2,3],"y":[3,5,7],"lr":0.1,"epochs":1000}', expectedOutput: '{"b":1.0,"w":2.0}', isPublic: true, timeLimit: 3, memoryLimit: 128000 },
            { input: '{"X":[-2,-1,0,1,2],"y":[-5,-3,-1,1,3],"lr":0.05,"epochs":1500}', expectedOutput: '{"b":-1.0,"w":2.0}', isPublic: false, timeLimit: 3, memoryLimit: 128000 },
        ],
    },
];

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
