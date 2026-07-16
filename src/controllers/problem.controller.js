const Problem = require('../models/Problem');
const Testcase = require('../models/Testcase');
const Submission = require('../models/Submission');
const { slugify, generateUniqueSlug } = require('../utils/slug');
const { sendMongooseError } = require('../utils/mongoErrors');
const logger = require('../utils/logger');

function testcasesAreInvalid(testcases) {
  return testcases !== undefined && (
    !Array.isArray(testcases)
    || testcases.length > 100
    || testcases.some((testcase) => (
      typeof testcase.input !== 'string'
      || typeof (testcase.expectedOutput ?? testcase.output) !== 'string'
      || Buffer.byteLength(testcase.input, 'utf8') > 1048576
      || Buffer.byteLength(testcase.expectedOutput ?? testcase.output, 'utf8') > 1048576
      || (testcase.timeLimit !== undefined && (testcase.timeLimit < 0.1 || testcase.timeLimit > 30))
      || (testcase.memoryLimit !== undefined && (testcase.memoryLimit < 16000 || testcase.memoryLimit > 512000))
    ))
  );
}

function testcaseDocuments(problemId, version, testcases) {
  return testcases.map((testcase) => ({
    problemId,
    version,
    input: testcase.input,
    expectedOutput: testcase.expectedOutput ?? testcase.output,
    isPublic: Boolean(testcase.isPublic),
    timeLimit: testcase.timeLimit,
    memoryLimit: testcase.memoryLimit,
  }));
}

exports.createProblem = async (req, res) => {
  let problem;
  try {
    const {
      title,
      description,
      difficulty,
      category,
      summary,
      acceptanceRate,
      tags,
      starterCode,
      constraints,
      hints,
      sampleTestCases,
      editorial,
      testcases,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'title and description are required' });
    }
    if (testcasesAreInvalid(testcases)) {
      return res.status(400).json({ message: 'Invalid testcases or execution limits' });
    }

    // Generate a unique slug so duplicate titles don't collide (previously a 500).
    const slug = await generateUniqueSlug(Problem, slugify(title));

    problem = new Problem({
      title,
      slug,
      description,
      difficulty,
      category,
      summary,
      acceptanceRate,
      tags,
      starterCode,
      constraints,
      hints,
      sampleTestCases,
      editorial,
    });

    await problem.save();

    // Create hidden/full test cases if provided.
    if (Array.isArray(testcases) && testcases.length > 0) {
      const tcDocs = testcaseDocuments(problem._id, problem.testcaseVersion, testcases);
      await Testcase.insertMany(tcDocs);
    }

    res.status(201).json(problem);
  } catch (error) {
    if (problem?._id) {
      await Promise.allSettled([
        Problem.deleteOne({ _id: problem._id }),
        Testcase.deleteMany({ problemId: problem._id }),
      ]);
    }
    sendMongooseError(res, error);
  }
};

exports.updateProblem = async (req, res) => {
  let insertedIds = [];
  try {
    const allowedFields = [
      'title',
      'description',
      'difficulty',
      'category',
      'summary',
      'acceptanceRate',
      'tags',
      'starterCode',
      'constraints',
      'hints',
      'editorial',
      'sampleTestCases',
    ];
    const updates = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    const current = await Problem.findOne({ _id: req.params.id, archivedAt: null });
    if (!current) return res.status(404).json({ message: 'Problem not found' });
    if (testcasesAreInvalid(req.body.testcases)) {
      return res.status(400).json({ message: 'Invalid testcases or execution limits' });
    }
    if (Array.isArray(req.body.testcases)) {
      const nextVersion = current.testcaseVersion + 1;
      const inserted = req.body.testcases.length
        ? await Testcase.insertMany(testcaseDocuments(current._id, nextVersion, req.body.testcases))
        : [];
      insertedIds = inserted.map((testcase) => testcase._id);
      updates.testcaseVersion = nextVersion;
    }

    const problem = await Problem.findOneAndUpdate({
      _id: req.params.id,
      archivedAt: null,
      testcaseVersion: current.testcaseVersion,
    }, updates, {
      returnDocument: 'after',
      runValidators: true,
    });
    if (!problem) {
      if (insertedIds.length) await Testcase.deleteMany({ _id: { $in: insertedIds } });
      return res.status(409).json({ message: 'Problem was updated concurrently; retry with fresh data' });
    }
    if (Array.isArray(req.body.testcases)) {
      insertedIds = [];
      await Testcase.deleteMany({
        problemId: problem._id,
        version: { $ne: problem.testcaseVersion },
      }).catch((cleanupError) => logger.warn('Stale testcase cleanup failed', {
        problemId: problem._id,
        error: cleanupError,
      }));
    }
    res.json(problem);
  } catch (error) {
    if (insertedIds.length) await Testcase.deleteMany({ _id: { $in: insertedIds } });
    sendMongooseError(res, error);
  }
};

exports.deleteProblem = async (req, res) => {
  try {
    const problem = await Problem.findOneAndUpdate({
      _id: req.params.id,
      archivedAt: null,
    }, { archivedAt: new Date() }, { returnDocument: 'after' });
    if (!problem) return res.status(404).json({ message: 'Problem not found' });
    await Testcase.deleteMany({ problemId: problem._id });
    res.json({ message: 'Problem deleted' });
  } catch (error) {
    sendMongooseError(res, error);
  }
};

exports.getProblems = async (req, res) => {
  try {
    const tags = typeof req.query.tags === 'string'
      ? [...new Set(req.query.tags.split(',').map((tag) => tag.trim()).filter(Boolean))]
      : [];
    if (tags.length > 10 || tags.some((tag) => tag.length > 50)) {
      return res.status(400).json({ message: 'Invalid tags filter' });
    }
    const filter = { archivedAt: null, ...(tags.length ? { tags: { $in: tags } } : {}) };
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 200);
    if (req.query.before) {
      if (!require('mongoose').Types.ObjectId.isValid(req.query.before)) {
        return res.status(400).json({ message: 'Invalid before cursor' });
      }
      filter._id = { $lt: req.query.before };
    }
    const problems = await Problem.find(filter, 'title slug difficulty category summary acceptanceRate tags')
      .sort({ _id: -1 })
      .limit(limit)
      .lean();
    if (problems.length === limit) {
      res.set('X-Next-Cursor', String(problems[problems.length - 1]._id));
    }

    // When authenticated (optionalAuth), annotate each problem with the user's
    // per-problem status: solved (has an Accepted submission), attempted (has
    // submissions but none accepted), or unsolved.
    if (req.user && req.user.id) {
      const problemIds = problems.map((problem) => problem._id);
      const [solvedIds, attemptedIds] = await Promise.all([
        Submission.distinct('problemId', {
          userId: req.user.id, problemId: { $in: problemIds }, status: 'Accepted',
        }),
        Submission.distinct('problemId', {
          userId: req.user.id, problemId: { $in: problemIds }, status: { $ne: 'Accepted' },
        }),
      ]);
      const solved = new Set(solvedIds.map(String));
      const attempted = new Set(attemptedIds.map(String));

      for (const problem of problems) {
        const pid = String(problem._id);
        problem.status = solved.has(pid)
          ? 'solved'
          : attempted.has(pid)
          ? 'attempted'
          : 'unsolved';
      }
    }

    res.json(problems);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getPracticeTestcases = async (req, res) => {
  try {
    const problem = await Problem.findOne({
      slug: req.params.slug,
      archivedAt: null,
    }).select('_id slug testcaseVersion').lean();
    if (!problem) return res.status(404).json({ message: 'Problem not found' });

    // Browser practice is intentionally non-adversarial: the current free-beta
    // runner already receives its full deterministic suite client-side. Serving
    // the active version here lets repository-imported problems use that same
    // execution path without rebuilding the frontend catalog on every content
    // merge.
    const testcases = await Testcase.find({
      problemId: problem._id,
      version: problem.testcaseVersion,
    }, 'input expectedOutput isPublic timeLimit memoryLimit -_id')
      .sort({ _id: 1 })
      .lean();

    res.set('Cache-Control', 'no-store');
    return res.json({
      problemId: String(problem._id),
      slug: problem.slug,
      testcaseVersion: problem.testcaseVersion,
      testcases,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getProblemBySlug = async (req, res) => {
  try {
    const problem = await Problem.findOne({ slug: req.params.slug, archivedAt: null });
    if (!problem) return res.status(404).json({ message: 'Problem not found' });

    // Surface how many hidden test cases exist without leaking their contents.
    const hiddenTestCount = await Testcase.countDocuments({
      problemId: problem._id,
      version: problem.testcaseVersion,
      isPublic: false,
    });

    const result = { ...problem.toObject(), hiddenTestCount };
    const isAdmin = req.user?.roles?.includes('Admin');
    const hasAccepted = req.user && await Submission.exists({
      userId: req.user.id,
      problemId: problem._id,
      status: 'Accepted',
    });
    if (!isAdmin && !hasAccepted) delete result.editorial;
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
