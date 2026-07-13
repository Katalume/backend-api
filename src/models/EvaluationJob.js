const mongoose = require('mongoose');
const { EVALUATION_JOB_RETENTION_DAYS } = require('../config/env');

const testcaseSchema = new mongoose.Schema({
    stdin: { type: String, default: '' },
    expectedOutput: { type: String, default: null },
    cpuTimeLimit: { type: Number, min: 0.1, max: 30, default: 2 },
    memoryLimit: { type: Number, min: 16000, max: 512000, default: 128000 },
}, { _id: false });

const evaluationJobSchema = new mongoose.Schema({
    kind: { type: String, enum: ['run', 'submission'], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission' },
    sourceCode: { type: String, required: true },
    languageId: { type: Number, required: true },
    testcases: {
        type: [testcaseSchema],
        required: true,
        validate: {
            validator: (items) => items.length >= 1 && items.length <= 100,
            message: 'Evaluation jobs require between 1 and 100 testcases',
        },
    },
    status: {
        type: String,
        enum: ['queued', 'processing', 'completed', 'failed', 'dead-letter'],
        default: 'queued',
        index: true,
    },
    result: { type: mongoose.Schema.Types.Mixed },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, required: true },
    availableAt: { type: Date, default: Date.now },
    lockedAt: Date,
    lockedBy: String,
    lastError: String,
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + EVALUATION_JOB_RETENTION_DAYS * 86400000),
    },
}, { timestamps: true });

evaluationJobSchema.index({ status: 1, availableAt: 1, createdAt: 1 });
evaluationJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
evaluationJobSchema.index({ submissionId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('EvaluationJob', evaluationJobSchema);
