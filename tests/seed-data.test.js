const Problem = require('../src/models/Problem');
const Testcase = require('../src/models/Testcase');
const { seedAll, PROBLEMS } = require('../scripts/seedData');
const { catalog } = require('../scripts/generateProblemCatalog');

describe('production seed catalog', () => {
    test('matches the deterministic catalog generator exactly', () => {
        expect(PROBLEMS).toEqual(catalog);
    });
    test('contains 100-200 unique, difficulty-balanced problems with calibrated test counts', () => {
        expect(PROBLEMS.length).toBeGreaterThanOrEqual(100);
        expect(PROBLEMS.length).toBeLessThanOrEqual(200);
        expect(new Set(PROBLEMS.map((problem) => problem.slug)).size).toBe(PROBLEMS.length);

        const counts = { Easy: 0, Medium: 0, Hard: 0 };
        let totalTests = 0;
        for (const problem of PROBLEMS) {
            counts[problem.difficulty] += 1;
            totalTests += problem.testcases.length;
            if (problem.difficulty === 'Easy') {
                expect(problem.testcases.length).toBeGreaterThanOrEqual(5);
                expect(problem.testcases.length).toBeLessThanOrEqual(10);
            } else if (problem.difficulty === 'Medium') {
                expect(problem.testcases.length).toBeGreaterThanOrEqual(20);
                expect(problem.testcases.length).toBeLessThanOrEqual(30);
            } else {
                expect(problem.testcases.length).toBeGreaterThanOrEqual(40);
                expect(problem.testcases.length).toBeLessThanOrEqual(80);
            }
        }
        expect(counts).toEqual({ Easy: 42, Medium: 42, Hard: 42 });
        expect(totalTests).toBe(3486);
    });

    test('uses a deterministic JSON stdin/stdout contract for every testcase', () => {
        for (const problem of PROBLEMS) {
            expect(problem.contentVersion).toBeGreaterThan(1);
            expect(problem.starterCode).toMatch(/def solve\(payload\):/);
            expect(problem.starterCode).toMatch(/json\.loads\(input\(\)\)/);
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
