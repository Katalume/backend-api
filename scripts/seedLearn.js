/**
 * Seed the learning tracks shown on the Learn page.
 *   node scripts/seedLearn.js
 * Re-running upserts by slug (idempotent).
 */
const mongoose = require('mongoose');
const { MONGO_URI } = require('../src/config/env');
const LearningTrack = require('../src/models/LearningTrack');
const logger = require('../src/utils/logger');

const TRACKS = [
    {
        slug: 'ml-foundations',
        title: 'ML Foundations',
        description: 'Linear models, overfitting, feature scaling, and evaluation.',
        tags: ['regression', 'optimization', 'classification'],
        order: 1,
        lessons: [
            'Bias-Variance Tradeoff',
            'Confusion Matrix and F1',
            'Regularization in Practice',
            'Gradient Descent Intuition',
        ],
    },
    {
        slug: 'pandas-for-interviews',
        title: 'Pandas for Interviews',
        description: 'Joins, groupby, window operations, and common data transforms.',
        tags: ['data-preprocessing'],
        order: 2,
        lessons: ['GroupBy Deep Dive', 'Joins and Merges', 'Window Functions'],
    },
    {
        slug: 'model-selection',
        title: 'Model Selection',
        description: 'Cross-validation, hyperparameter tuning, and proper split strategy.',
        tags: ['model-evaluation'],
        order: 3,
        lessons: ['Cross-Validation', 'Hyperparameter Tuning', 'Feature Drift Detection'],
    },
];

async function run() {
    await mongoose.connect(MONGO_URI);
    logger.info('Connected to MongoDB');
    try {
        for (const track of TRACKS) {
            await LearningTrack.findOneAndUpdate({ slug: track.slug }, track, {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
            });
            logger.info(`Upserted learning track: ${track.slug}`);
        }
    } finally {
        await mongoose.disconnect();
    }
}

run().catch((err) => {
    logger.error('Failed to seed learning tracks:', err);
    process.exit(1);
});
