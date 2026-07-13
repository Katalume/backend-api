const Problem = require('../src/models/Problem');
const Testcase = require('../src/models/Testcase');
const { seedAll, PROBLEMS } = require('../scripts/seedData');

describe('production seed catalog', () => {
    test('uses a deterministic JSON stdin/stdout contract for every testcase', () => {
        for (const problem of PROBLEMS) {
            expect(problem.contentVersion).toBeGreaterThan(1);
            expect(problem.starterCode).toMatch(/json\.loads\(sys\.stdin\.read\(\)\)/);
            for (const testcase of problem.testcases) {
                expect(() => JSON.parse(testcase.input)).not.toThrow();
                expect(() => JSON.parse(testcase.expectedOutput)).not.toThrow();
                expect(testcase.timeLimit).toBeGreaterThan(0);
                expect(testcase.memoryLimit).toBeGreaterThanOrEqual(16000);
            }
            expect(problem.testcases.some((testcase) => testcase.isPublic)).toBe(true);
            expect(problem.testcases.some((testcase) => !testcase.isPublic)).toBe(true);
        }
    });

    test('is idempotent and publishes exactly one active testcase version', async () => {
        await seedAll();
        await seedAll();
        expect(await Problem.countDocuments()).toBe(PROBLEMS.length);
        for (const spec of PROBLEMS) {
            const problem = await Problem.findOne({ slug: spec.slug });
            expect(problem.contentVersion).toBe(spec.contentVersion);
            expect(await Testcase.countDocuments({ problemId: problem._id })).toBe(spec.testcases.length);
            expect(await Testcase.countDocuments({
                problemId: problem._id,
                version: problem.testcaseVersion,
            })).toBe(spec.testcases.length);
        }
    });
});
