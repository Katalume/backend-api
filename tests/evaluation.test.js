const request = require('supertest');

jest.mock('../src/services/judge.service', () => ({
    executeBatch: jest.fn().mockResolvedValue([{
        status: { id: 3, description: 'Accepted' },
        time: '0.02',
        memory: 2048,
        stdout: Buffer.from('ok').toString('base64'),
    }]),
}));

const app = require('../src/app');
const judgeService = require('../src/services/judge.service');
const EvaluationJob = require('../src/models/EvaluationJob');
const Submission = require('../src/models/Submission');
const Problem = require('../src/models/Problem');
const Contest = require('../src/models/Contest');
const Leaderboard = require('../src/models/Leaderboard');
const { processJob, claimJob } = require('../src/services/evaluation.service');

async function signup() {
    return request(app).post('/api/auth/signup').send({
        username: 'runner', email: 'runner@example.com', password: 'password123', role: 'User',
    });
}

describe('durable evaluation jobs', () => {
    test('custom runs return 202 and expose results only to their owner', async () => {
        const auth = await signup();
        const queued = await request(app)
            .post('/api/runner/run')
            .set('Authorization', `Bearer ${auth.body.accessToken}`)
            .send({ code: 'print(input())', languageId: 71, customInput: 'hello' });
        expect(queued.status).toBe(202);
        expect(queued.body.status).toBe('queued');

        const job = await EvaluationJob.findById(queued.body.id);
        await processJob(job);
        const completed = await request(app)
            .get(`/api/runner/jobs/${job._id}`)
            .set('Authorization', `Bearer ${auth.body.accessToken}`);
        expect(completed.body).toMatchObject({
            status: 'completed',
            result: { status: 'Accepted', stdout: 'ok' },
        });
    });

    test('passes testcase resource limits into the judge payload', async () => {
        const auth = await signup();
        const queued = await request(app)
            .post('/api/runner/run')
            .set('Authorization', `Bearer ${auth.body.accessToken}`)
            .send({ code: 'print(1)', languageId: 71 });
        const job = await EvaluationJob.findById(queued.body.id);
        job.testcases[0].cpuTimeLimit = 1.5;
        job.testcases[0].memoryLimit = 64000;
        await processJob(job);
        expect(judgeService.executeBatch).toHaveBeenCalledWith([
            expect.objectContaining({ cpu_time_limit: 1.5, memory_limit: 64000 }),
        ]);
    });

    test('moves exhausted jobs to dead-letter and marks submissions safely', async () => {
        const auth = await signup();
        const problem = await Problem.create({ title: 'P', slug: 'p', description: 'd' });
        const submission = await Submission.create({
            userId: auth.body.user.id,
            problemId: problem._id,
            code: 'x',
            languageId: 71,
        });
        const job = await EvaluationJob.create({
            kind: 'submission',
            userId: auth.body.user.id,
            submissionId: submission._id,
            sourceCode: 'x',
            languageId: 71,
            testcases: [{ stdin: '', expectedOutput: '' }],
            status: 'processing',
            attempts: 1,
            maxAttempts: 1,
        });
        judgeService.executeBatch.mockRejectedValueOnce(new Error('executor unavailable'));
        await expect(processJob(job)).rejects.toThrow('executor unavailable');
        expect((await EvaluationJob.findById(job._id)).status).toBe('dead-letter');
        expect((await Submission.findById(submission._id)).status).toBe('Internal Error');
    });

    test('reclaims a stale processing job atomically', async () => {
        const auth = await signup();
        const stale = await EvaluationJob.create({
            kind: 'run', userId: auth.body.user.id, sourceCode: 'x', languageId: 71,
            testcases: [{ stdin: '' }], status: 'processing', lockedAt: new Date(Date.now() - 180000),
            attempts: 0, maxAttempts: 3,
        });
        const claimed = await claimJob();
        expect(String(claimed._id)).toBe(String(stale._id));
        expect(claimed.status).toBe('processing');
        expect(claimed.attempts).toBe(1);
        expect(claimed.lockedBy).toBeTruthy();
    });

    test('updates contest standings exactly once for repeated accepted solves', async () => {
        const auth = await signup();
        const problem = await Problem.create({ title: 'P', slug: 'p', description: 'd' });
        const contest = await Contest.create({
            title: 'Live', startTime: new Date(Date.now() - 60000), endTime: new Date(Date.now() + 60000),
            participants: [auth.body.user.id], problems: [problem._id],
        });
        for (let index = 0; index < 2; index += 1) {
            const submission = await Submission.create({
                userId: auth.body.user.id, problemId: problem._id, contestId: contest._id,
                code: 'x', languageId: 71,
            });
            const job = await EvaluationJob.create({
                kind: 'submission', userId: auth.body.user.id, submissionId: submission._id,
                sourceCode: 'x', languageId: 71, testcases: [{ stdin: '', expectedOutput: '' }],
                status: 'processing', attempts: 1, maxAttempts: 3,
            });
            await processJob(job);
        }
        const row = await Leaderboard.findOne({ contestId: contest._id, userId: auth.body.user.id });
        expect(row.score).toBe(1);
        expect(row.problemsSolved).toHaveLength(1);
    });
});
