const Problem = require('../models/Problem');
const Testcase = require('../models/Testcase');

const DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard']);
const MAX_PROBLEMS = 500;
const MAX_TESTCASES = 200;
const MAX_IO = 1048576; // Testcase input/expectedOutput maxlength

class ImportValidationError extends Error {}

function assertString(value, name, max) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new ImportValidationError(`${name} must be a non-empty string`);
    }
    if (max && value.length > max) {
        throw new ImportValidationError(`${name} exceeds ${max} characters`);
    }
}

function validateProblem(spec, index) {
    const label = `problems[${index}]`;
    if (!spec || typeof spec !== 'object') throw new ImportValidationError(`${label} must be an object`);
    assertString(spec.slug, `${label}.slug`, 120);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(spec.slug)) {
        throw new ImportValidationError(`${label}.slug must be kebab-case`);
    }
    assertString(spec.title, `${label}.title`, 160);
    assertString(spec.description, `${label}.description`, 50000);
    assertString(spec.starterCode, `${label}.starterCode`, 100000);
    if (spec.category != null) {
        assertString(spec.category, `${label}.category`, 80);
    }
    if (!DIFFICULTIES.has(spec.difficulty)) {
        throw new ImportValidationError(`${label}.difficulty must be Easy|Medium|Hard`);
    }
    if (!Array.isArray(spec.tags) || spec.tags.length === 0
        || !spec.tags.every((t) => typeof t === 'string' && t.length <= 50)) {
        throw new ImportValidationError(`${label}.tags must be a non-empty list of short strings`);
    }
    if (spec.constraints && (!Array.isArray(spec.constraints)
        || !spec.constraints.every((c) => typeof c === 'string'))) {
        throw new ImportValidationError(`${label}.constraints must be a list of strings`);
    }
    if (!Array.isArray(spec.testcases) || spec.testcases.length === 0
        || spec.testcases.length > MAX_TESTCASES) {
        throw new ImportValidationError(`${label}.testcases must contain 1-${MAX_TESTCASES} entries`);
    }
    spec.testcases.forEach((tc, i) => {
        assertString(tc.input, `${label}.testcases[${i}].input`, MAX_IO);
        assertString(tc.expectedOutput, `${label}.testcases[${i}].expectedOutput`, MAX_IO);
        if (tc.timeLimit != null && (typeof tc.timeLimit !== 'number' || tc.timeLimit < 0.1 || tc.timeLimit > 30)) {
            throw new ImportValidationError(`${label}.testcases[${i}].timeLimit out of range`);
        }
        if (tc.memoryLimit != null
            && (typeof tc.memoryLimit !== 'number' || tc.memoryLimit < 16000 || tc.memoryLimit > 512000)) {
            throw new ImportValidationError(`${label}.testcases[${i}].memoryLimit out of range`);
        }
    });
}

function normalizedFields(spec) {
    return {
        title: spec.title,
        description: spec.description,
        difficulty: spec.difficulty,
        tags: spec.tags,
        constraints: spec.constraints || [],
        starterCode: spec.starterCode,
        category: spec.category || 'General',
        sampleTestCases: (spec.sampleTestCases || []).map((s) => ({
            input: s.input,
            output: s.output,
            ...(s.explanation ? { explanation: s.explanation } : {}),
        })),
        editorial: spec.editorial || undefined,
        archivedAt: null,
    };
}

function normalizedTestcase(tc) {
    return {
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        isPublic: Boolean(tc.isPublic),
        timeLimit: tc.timeLimit ?? 2.0,
        memoryLimit: tc.memoryLimit ?? 128000,
    };
}

/** Deep-compare the incoming spec against the stored problem + its testcases. */
function isUnchanged(spec, existing, existingTestcases) {
    const incoming = normalizedFields(spec);
    const currentSamples = (existing.sampleTestCases || []).map((s) => ({
        input: s.input,
        output: s.output,
        ...(s.explanation ? { explanation: s.explanation } : {}),
    }));
    const currentEditorial = existing.editorial && existing.editorial.summary !== undefined
        ? {
            summary: existing.editorial.summary || '',
            approach: existing.editorial.approach || '',
            timeComplexity: existing.editorial.timeComplexity || '',
            spaceComplexity: existing.editorial.spaceComplexity || '',
            pitfalls: existing.editorial.pitfalls || [],
        }
        : undefined;
    const incomingEditorial = incoming.editorial
        ? {
            summary: incoming.editorial.summary || '',
            approach: incoming.editorial.approach || '',
            timeComplexity: incoming.editorial.timeComplexity || '',
            spaceComplexity: incoming.editorial.spaceComplexity || '',
            pitfalls: incoming.editorial.pitfalls || [],
        }
        : undefined;

    const fieldsSame = existing.title === incoming.title
        && existing.category === incoming.category
        && existing.description === incoming.description
        && existing.difficulty === incoming.difficulty
        && JSON.stringify(existing.tags) === JSON.stringify(incoming.tags)
        && JSON.stringify(existing.constraints) === JSON.stringify(incoming.constraints)
        && existing.starterCode === incoming.starterCode
        && JSON.stringify(currentSamples) === JSON.stringify(incoming.sampleTestCases)
        && JSON.stringify(currentEditorial) === JSON.stringify(incomingEditorial)
        && !existing.archivedAt;
    if (!fieldsSame) return false;

    const incomingCases = spec.testcases.map(normalizedTestcase);
    if (existingTestcases.length !== incomingCases.length) return false;
    return existingTestcases.every((tc, i) => {
        const inc = incomingCases[i];
        return tc.input === inc.input
            && tc.expectedOutput === inc.expectedOutput
            && tc.isPublic === inc.isPublic
            && tc.timeLimit === inc.timeLimit
            && tc.memoryLimit === inc.memoryLimit;
    });
}

/**
 * Idempotent catalog import: upsert every problem by slug (slug immutable),
 * with versioned testcase replacement (the seedData concurrency pattern).
 * Returns { created, updated, unchanged, total }.
 */
async function importProblems(payload) {
    if (!payload || !Array.isArray(payload.problems)) {
        throw new ImportValidationError('payload must be { problems: [...] }');
    }
    if (payload.problems.length === 0 || payload.problems.length > MAX_PROBLEMS) {
        throw new ImportValidationError(`problems must contain 1-${MAX_PROBLEMS} entries`);
    }
    payload.problems.forEach(validateProblem);
    const slugs = payload.problems.map((p) => p.slug);
    if (new Set(slugs).size !== slugs.length) {
        throw new ImportValidationError('duplicate slugs in payload');
    }

    const summary = { created: 0, updated: 0, unchanged: 0, total: payload.problems.length };

    for (const spec of payload.problems) {
        const existing = await Problem.findOne({ slug: spec.slug });
        const fields = normalizedFields(spec);
        const cases = spec.testcases.map(normalizedTestcase);

        if (existing) {
            const currentCases = await Testcase.find({
                problemId: existing._id,
                version: existing.testcaseVersion,
            }).sort({ _id: 1 }).lean();
            if (isUnchanged(spec, existing, currentCases)) {
                summary.unchanged += 1;
                continue;
            }
        }

        const problem = existing
            || await Problem.create({ ...fields, slug: spec.slug, testcaseVersion: 1, contentVersion: 1 });
        const nextVersion = existing ? existing.testcaseVersion + 1 : 1;
        let inserted = [];
        let switched = false;
        try {
            inserted = await Testcase.insertMany(cases.map((tc) => ({
                ...tc,
                problemId: problem._id,
                version: nextVersion,
            })));
            // Single guarded write switches fields, versions AND testcase refs
            // together, so a crash on either side of it leaves the problem
            // consistently on the old or the new version - never in between.
            const guard = existing
                ? {
                    _id: problem._id,
                    contentVersion: existing.contentVersion,
                    testcaseVersion: existing.testcaseVersion,
                }
                : { _id: problem._id };
            const write = await Problem.updateOne(guard, {
                $set: {
                    ...fields,
                    importedAt: new Date(),
                    testcaseVersion: nextVersion,
                    contentVersion: existing ? existing.contentVersion + 1 : 1,
                    testcases: inserted.map((tc) => tc._id),
                },
            });
            if (write.matchedCount !== 1) {
                throw new Error(`Concurrent content update: ${spec.slug}`);
            }
            switched = true;
        } catch (error) {
            // Roll back ONLY when the guarded switch never happened. After a
            // successful switch the problem already points at the new version,
            // so deleting the new testcases here would corrupt it.
            if (!switched) {
                if (inserted.length) {
                    await Testcase.deleteMany({ _id: { $in: inserted.map((tc) => tc._id) } });
                }
                if (!existing) await Problem.deleteOne({ _id: problem._id });
            }
            throw error;
        }
        // Old-version cleanup sits OUTSIDE the rollback scope: a failure here
        // leaves orphaned rows of a superseded version, never a broken problem.
        await Testcase.deleteMany({ problemId: problem._id, version: { $ne: nextVersion } });
        summary[existing ? 'updated' : 'created'] += 1;
    }

    // Optional: the repo is the source of truth for pipeline-managed problems,
    // so a bundle sent with archiveMissing archives previously imported
    // problems that are no longer in it. Problems seeded by other means
    // (importedAt: null) are never touched.
    if (payload.archiveMissing === true) {
        const archived = await Problem.updateMany(
            { importedAt: { $ne: null }, archivedAt: null, slug: { $nin: slugs } },
            { $set: { archivedAt: new Date() } }
        );
        summary.archived = archived.modifiedCount;
    }
    return summary;
}

module.exports = { importProblems, ImportValidationError };
