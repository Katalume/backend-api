const os = require('os');
const EvaluationJob = require('../models/EvaluationJob');
const Submission = require('../models/Submission');
const judgeService = require('./judge.service');
const { recordAcceptedContestSubmission } = require('./leaderboard.service');
const { EVALUATION_JOB_MAX_ATTEMPTS } = require('../config/env');
const logger = require('../utils/logger');

const workerId = `${os.hostname()}:${process.pid}`;

function publicJob(job) {
    return {
        id: job._id,
        kind: job.kind,
        status: job.status,
        result: job.status === 'completed' ? job.result : undefined,
        error: job.status === 'dead-letter' ? 'Evaluation could not be completed' : undefined,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
    };
}

async function enqueueJob(data) {
    return EvaluationJob.create({
        ...data,
        status: 'queued',
        maxAttempts: EVALUATION_JOB_MAX_ATTEMPTS,
        availableAt: new Date(),
    });
}

async function claimJob() {
    const staleBefore = new Date(Date.now() - 2 * 60 * 1000);
    return EvaluationJob.findOneAndUpdate({
        $or: [
            { status: 'queued', availableAt: { $lte: new Date() } },
            { status: 'processing', lockedAt: { $lt: staleBefore } },
        ],
    }, {
        $set: { status: 'processing', lockedAt: new Date(), lockedBy: workerId },
        $inc: { attempts: 1 },
    }, { returnDocument: 'after', sort: { createdAt: 1 } });
}

function decode(value) {
    return value ? Buffer.from(value, 'base64').toString('utf8') : '';
}

function formatRunResult(results, testcases) {
    const cases = results.map((result, index) => ({
        name: `Sample ${index + 1}`,
        visibility: 'sample',
        input: testcases[index]?.stdin,
        expectedOutput: testcases[index]?.expectedOutput,
        actualOutput: decode(result.stdout),
        passed: result.status?.id === 3,
        errorMessage: decode(result.stderr || result.compile_output || result.message),
    }));
    const firstFailure = results.find((result) => result.status?.id !== 3);
    return {
        status: firstFailure?.status?.description || 'Accepted',
        statusId: firstFailure?.status?.id || 3,
        stdout: decode(results[0]?.stdout),
        stderr: decode(firstFailure?.stderr),
        compileOutput: decode(firstFailure?.compile_output),
        time: Math.max(0, ...results.map((result) => Number(result.time || 0))),
        memory: Math.max(0, ...results.map((result) => Number(result.memory || 0))),
        message: firstFailure?.message || null,
        passedCount: cases.filter((testcase) => testcase.passed).length,
        totalCount: cases.length,
        testCases: cases,
    };
}

function analyzeSubmission(results) {
    let status = 'Accepted';
    let runtime = 0;
    let memory = 0;
    let errorMessage = null;

    for (const result of results) {
        runtime = Math.max(runtime, Number(result.time || 0));
        memory = Math.max(memory, Number(result.memory || 0));
        if (result.status?.id !== 3) {
            status = result.status?.description || 'Internal Error';
            errorMessage = decode(result.stderr || result.compile_output || result.message);
            break;
        }
    }
    return { status, runtime, memory, errorMessage };
}

async function processJob(job) {
    if (job.submissionId) {
        await Submission.updateOne({ _id: job.submissionId }, { status: 'Processing' });
    }

    const heartbeat = job.lockedBy
        ? setInterval(() => {
            EvaluationJob.updateOne(
                { _id: job._id, status: 'processing', lockedBy: job.lockedBy },
                { lockedAt: new Date() }
            ).catch(() => {});
        }, 30000).unref()
        : null;

    try {
        const payloads = job.testcases.map((testcase) => ({
            source_code: job.sourceCode,
            language_id: job.languageId,
            stdin: testcase.stdin,
            expected_output: testcase.expectedOutput,
            cpu_time_limit: testcase.cpuTimeLimit,
            memory_limit: testcase.memoryLimit,
        }));
        const results = await judgeService.executeBatch(payloads);
        const result = job.kind === 'run' ? formatRunResult(results, job.testcases) : analyzeSubmission(results);

        if (job.submissionId) {
            const submission = await Submission.findByIdAndUpdate(job.submissionId, result, { returnDocument: 'after' });
            if (submission) await recordAcceptedContestSubmission(submission);
        }
        await EvaluationJob.updateOne({ _id: job._id }, {
            $set: { status: 'completed', result, lockedAt: null, lockedBy: null, lastError: null },
        });
        return result;
    } catch (error) {
        const exhausted = job.attempts >= job.maxAttempts;
        const status = exhausted ? 'dead-letter' : 'queued';
        const delay = Math.min(30000, 1000 * (2 ** Math.max(0, job.attempts - 1)));
        await EvaluationJob.updateOne({ _id: job._id }, {
            $set: {
                status,
                availableAt: new Date(Date.now() + delay),
                lockedAt: null,
                lockedBy: null,
                lastError: String(error.message || error).slice(0, 1000),
            },
        });
        if (exhausted && job.submissionId) {
            await Submission.updateOne({ _id: job.submissionId }, {
                status: 'Internal Error',
                errorMessage: 'Evaluation could not be completed',
            });
        }
        throw error;
    } finally {
        if (heartbeat) clearInterval(heartbeat);
    }
}

async function processNextJob() {
    const job = await claimJob();
    if (!job) return false;
    try {
        await processJob(job);
    } catch (error) {
        logger.warn('Evaluation attempt failed', {
            jobId: job._id,
            submissionId: job.submissionId,
            attempt: job.attempts,
            error,
        });
    }
    return true;
}

module.exports = { enqueueJob, claimJob, processJob, processNextJob, publicJob };
