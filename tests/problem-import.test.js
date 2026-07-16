const request = require('supertest');
const app = require('../src/app');
const Problem = require('../src/models/Problem');
const Testcase = require('../src/models/Testcase');

const TOKEN = 'test-import-token-0123456789abcdef';

function makeProblem(overrides = {}) {
    return {
        slug: 'sample-problem',
        title: 'Sample Problem',
        description: 'S'.repeat(220),
        difficulty: 'Easy',
        tags: ['metrics'],
        constraints: ['1 <= n <= 100'],
        starterCode: 'import json\n',
        editorial: { summary: 'sum it', approach: 'loop', timeComplexity: 'O(n)', spaceComplexity: 'O(1)', pitfalls: ['off by one'] },
        sampleTestCases: [{ input: '{"a":1}', output: '1' }],
        testcases: [
            { input: '{"a":1}', expectedOutput: '1', isPublic: true, timeLimit: 2, memoryLimit: 128000 },
            { input: '{"a":2}', expectedOutput: '2', isPublic: false, timeLimit: 2, memoryLimit: 128000 },
        ],
        ...overrides,
    };
}

function post(body, token = TOKEN) {
    const req = request(app).post('/api/import/problems');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
}

describe('POST /api/import/problems — auth', () => {
    test('rejects a missing token', async () => {
        const res = await post({ problems: [makeProblem()] }, null);
        expect(res.status).toBe(401);
    });

    test('rejects a wrong token', async () => {
        const res = await post({ problems: [makeProblem()] }, 'wrong-token');
        expect(res.status).toBe(401);
    });
});

describe('POST /api/import/problems — validation', () => {
    test('rejects a malformed payload', async () => {
        const res = await post({ nope: true });
        expect(res.status).toBe(422);
    });

    test('rejects a bad slug', async () => {
        const res = await post({ problems: [makeProblem({ slug: 'Bad Slug!' })] });
        expect(res.status).toBe(422);
        expect(res.body.message).toMatch(/kebab-case/);
    });

    test('rejects duplicate slugs in one payload', async () => {
        const res = await post({ problems: [makeProblem(), makeProblem()] });
        expect(res.status).toBe(422);
        expect(res.body.message).toMatch(/duplicate/);
    });

    test('rejects an out-of-range time limit', async () => {
        const bad = makeProblem();
        bad.testcases[0].timeLimit = 99;
        const res = await post({ problems: [bad] });
        expect(res.status).toBe(422);
    });
});

describe('POST /api/import/problems — upsert lifecycle', () => {
    test('creates a problem with versioned testcases and links them', async () => {
        const res = await post({ problems: [makeProblem()] });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ created: 1, updated: 0, unchanged: 0, total: 1 });

        const problem = await Problem.findOne({ slug: 'sample-problem' });
        expect(problem).toBeTruthy();
        expect(problem.testcaseVersion).toBe(1);
        expect(problem.testcases).toHaveLength(2);
        const cases = await Testcase.find({ problemId: problem._id });
        expect(cases).toHaveLength(2);
        expect(cases.every((tc) => tc.version === 1)).toBe(true);
    });

    test('re-importing identical content is a no-op', async () => {
        await post({ problems: [makeProblem()] });
        const res = await post({ problems: [makeProblem()] });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
        const problem = await Problem.findOne({ slug: 'sample-problem' });
        expect(problem.testcaseVersion).toBe(1);
        expect(await Testcase.countDocuments({ problemId: problem._id })).toBe(2);
    });

    test('changed content bumps versions and replaces testcases', async () => {
        await post({ problems: [makeProblem()] });
        const changed = makeProblem({ title: 'Sample Problem v2' });
        changed.testcases.push({ input: '{"a":3}', expectedOutput: '3', isPublic: false });
        const res = await post({ problems: [changed] });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ created: 0, updated: 1, unchanged: 0 });

        const problem = await Problem.findOne({ slug: 'sample-problem' });
        expect(problem.title).toBe('Sample Problem v2');
        expect(problem.testcaseVersion).toBe(2);
        expect(problem.contentVersion).toBe(2);
        const cases = await Testcase.find({ problemId: problem._id });
        expect(cases).toHaveLength(3);
        expect(cases.every((tc) => tc.version === 2)).toBe(true);
    });

    test('imported problems surface on the public problems list', async () => {
        await post({ problems: [makeProblem()] });
        const res = await request(app).get('/api/problems');
        expect(res.status).toBe(200);
        const list = res.body.problems || res.body;
        expect(JSON.stringify(list)).toContain('sample-problem');
    });

    test('accepts a multi-megabyte bundle (own body limit)', async () => {
        const big = makeProblem({
            slug: 'big-problem',
            testcases: Array.from({ length: 40 }, (_, i) => ({
                input: JSON.stringify({ blob: 'x'.repeat(40000), i }),
                expectedOutput: String(i),
                isPublic: i === 0,
            })),
        });
        const res = await post({ problems: [big] });
        expect(res.status).toBe(200);
        expect(res.body.created).toBe(1);
    });
});

describe('POST /api/import/problems — review fixes', () => {
    test('persists the category and detects category-only changes', async () => {
        await post({ problems: [makeProblem({ category: 'Model Evaluation' })] });
        let problem = await Problem.findOne({ slug: 'sample-problem' });
        expect(problem.category).toBe('Model Evaluation');
        expect(problem.importedAt).toBeTruthy();

        const res = await post({ problems: [makeProblem({ category: 'NLP' })] });
        expect(res.body).toMatchObject({ updated: 1 });
        problem = await Problem.findOne({ slug: 'sample-problem' });
        expect(problem.category).toBe('NLP');
    });

    test('archiveMissing archives pipeline problems absent from the bundle, never seeded ones', async () => {
        await post({ problems: [makeProblem(), makeProblem({ slug: 'second-problem', title: 'Second' })] });
        await Problem.create({
            slug: 'seeded-problem', title: 'Seeded', description: 'S'.repeat(220),
            difficulty: 'Easy', tags: ['x'], starterCode: 'pass',
        });

        const res = await post({ problems: [makeProblem()], archiveMissing: true });
        expect(res.body.archived).toBe(1);
        expect((await Problem.findOne({ slug: 'second-problem' })).archivedAt).toBeTruthy();
        expect((await Problem.findOne({ slug: 'seeded-problem' })).archivedAt).toBeNull();
        expect((await Problem.findOne({ slug: 'sample-problem' })).archivedAt).toBeNull();
    });
});

describe('POST /api/import/problems — rollback boundary', () => {
    test('cleanup failure after the version switch never deletes the new testcases', async () => {
        await post({ problems: [makeProblem()] });
        const original = jest.spyOn(Testcase, 'deleteMany')
            .mockRejectedValueOnce(new Error('simulated cleanup outage'));

        const changed = makeProblem({ title: 'Sample Problem v2' });
        const res = await post({ problems: [changed] });
        original.mockRestore();

        expect(res.status).toBe(500);
        const problem = await Problem.findOne({ slug: 'sample-problem' });
        // The switch already happened, so the problem must sit consistently on
        // version 2 with its new testcases intact (old rows merely orphaned).
        expect(problem.testcaseVersion).toBe(2);
        expect(problem.title).toBe('Sample Problem v2');
        const newCases = await Testcase.find({ problemId: problem._id, version: 2 });
        expect(newCases).toHaveLength(2);
        expect(problem.testcases).toHaveLength(2);
    });
});
