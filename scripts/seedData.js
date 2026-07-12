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
        slug: 'knn-classifier-iris',
        title: 'KNN Classifier on Iris',
        difficulty: 'Easy',
        tags: ['scikit-learn', 'classification', 'knn'],
        description:
            'Implement fit_and_predict(X_train, y_train, X_test, k) using K-Nearest Neighbors with Euclidean distance and majority voting.',
        constraints: ['1 <= k <= len(X_train)', 'Return a list of integer class predictions.'],
        starterCode: 'def fit_and_predict(X_train, y_train, X_test, k):\n    pass',
        sampleTestCases: [
            { input: 'X=[[5.1,3.5]], y=[0], T=[[5.0,3.4]], k=1', output: '[0]' },
        ],
        editorial: {
            summary: 'Brute-force nearest neighbours with deterministic tie-breaking.',
            approach: 'Compute distances, sort, take top-k, majority vote.',
            timeComplexity: 'O(n*m*d)',
            spaceComplexity: 'O(n)',
            pitfalls: ['Non-deterministic tie-breaking.'],
        },
        testcases: [
            { input: '1\n5.0 3.4', expectedOutput: '[0]', isPublic: true },
            { input: '3\n6.5 3.0', expectedOutput: '[1]', isPublic: false },
        ],
    },
    {
        slug: 'standardize-dataset',
        title: 'Standardize a Dataset',
        difficulty: 'Easy',
        tags: ['data-preprocessing', 'numpy'],
        description: 'Implement z-score standardization column-wise for a 2D list of floats.',
        constraints: ['Return values rounded to 4 decimals.'],
        starterCode: 'def standardize(X):\n    pass',
        sampleTestCases: [{ input: 'X=[[1,2],[3,4]]', output: '[[-1,-1],[1,1]]' }],
        editorial: {
            summary: 'Subtract the mean and divide by the standard deviation per column.',
            approach: 'Compute column mean/std, apply (x-mean)/std.',
            timeComplexity: 'O(n*d)',
            spaceComplexity: 'O(n*d)',
            pitfalls: ['Dividing by zero std.'],
        },
        testcases: [{ input: '2\n1 2\n3 4', expectedOutput: '[[-1.0,-1.0],[1.0,1.0]]', isPublic: true }],
    },
    {
        slug: 'linear-regression-gd',
        title: 'Linear Regression via Gradient Descent',
        difficulty: 'Medium',
        tags: ['regression', 'optimization', 'numpy'],
        description:
            'Implement train_linear_regression(X, y, lr, epochs) returning (w, b) that minimizes MSE via full-batch gradient descent.',
        constraints: ['Return floats rounded to 4 decimals.'],
        starterCode: 'def train_linear_regression(X, y, lr, epochs):\n    pass',
        sampleTestCases: [{ input: 'X=[1,2,3], y=[3,5,7]', output: '(2.0, 1.0)' }],
        editorial: {
            summary: 'Batch gradient descent on MSE.',
            approach: 'Update w and b using MSE gradients each epoch.',
            timeComplexity: 'O(epochs*n)',
            spaceComplexity: 'O(1)',
            pitfalls: ['Learning rate too high diverges.'],
        },
        testcases: [{ input: '3\n1 2 3\n3 5 7', expectedOutput: '(2.0, 1.0)', isPublic: false }],
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
        if (existing) continue;
        const { testcases, ...problemData } = spec;
        const problem = await Problem.create(problemData);
        if (testcases && testcases.length) {
            await Testcase.insertMany(
                testcases.map((tc) => ({ ...tc, problemId: problem._id }))
            );
        }
        logger.info(`Seeded problem: ${spec.slug}`);
    }
}

async function seedContests() {
    if ((await Contest.countDocuments()) > 0) return;
    const now = Date.now();
    const HOUR = 60 * 60 * 1000;
    await Contest.create([
        {
            title: 'Model Metrics Championship',
            description: 'Solve 5 evaluation-heavy challenges under 75 minutes.',
            startTime: new Date(now - HOUR),
            endTime: new Date(now + HOUR),
        },
        {
            title: 'Feature Engineering Arena',
            description: 'Timed feature-engineering gauntlet.',
            startTime: new Date(now + 3 * HOUR),
            endTime: new Date(now + 5 * HOUR),
        },
    ]);
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

module.exports = { seedAll };

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
