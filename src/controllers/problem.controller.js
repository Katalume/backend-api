const Problem = require('../models/Problem');
const Testcase = require('../models/Testcase');
const Submission = require('../models/Submission');
const { slugify, generateUniqueSlug } = require('../utils/slug');
const { sendMongooseError } = require('../utils/mongoErrors');

exports.createProblem = async (req, res) => {
  try {
    const {
      title,
      description,
      difficulty,
      tags,
      starterCode,
      constraints,
      sampleTestCases,
      editorial,
      testcases,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'title and description are required' });
    }

    // Generate a unique slug so duplicate titles don't collide (previously a 500).
    const slug = await generateUniqueSlug(Problem, slugify(title));

    const problem = new Problem({
      title,
      slug,
      description,
      difficulty,
      tags,
      starterCode,
      constraints,
      sampleTestCases,
      editorial,
    });

    await problem.save();

    // Create hidden/full test cases if provided.
    if (Array.isArray(testcases) && testcases.length > 0) {
      const tcDocs = testcases.map((tc) => ({
        problemId: problem._id,
        input: tc.input,
        expectedOutput: tc.expectedOutput ?? tc.output,
        isPublic: Boolean(tc.isPublic),
      }));
      await Testcase.insertMany(tcDocs);
    }

    res.status(201).json(problem);
  } catch (error) {
    sendMongooseError(res, error);
  }
};

exports.updateProblem = async (req, res) => {
  try {
    const allowedFields = [
      'title',
      'description',
      'difficulty',
      'tags',
      'starterCode',
      'constraints',
      'editorial',
      'sampleTestCases',
    ];
    const updates = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    const problem = await Problem.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!problem) return res.status(404).json({ message: 'Problem not found' });
    res.json(problem);
  } catch (error) {
    sendMongooseError(res, error);
  }
};

exports.deleteProblem = async (req, res) => {
  try {
    const problem = await Problem.findByIdAndDelete(req.params.id);
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
    const filter = tags.length ? { tags: { $in: tags } } : {};
    const problems = await Problem.find(filter, 'title slug difficulty tags').lean();

    // When authenticated (optionalAuth), annotate each problem with the user's
    // per-problem status: solved (has an Accepted submission), attempted (has
    // submissions but none accepted), or unsolved.
    if (req.user && req.user.id) {
      const subs = await Submission.find(
        { userId: req.user.id },
        'problemId status'
      ).lean();

      const solved = new Set();
      const attempted = new Set();
      for (const sub of subs) {
        const pid = String(sub.problemId);
        if (sub.status === 'Accepted') {
          solved.add(pid);
        } else {
          attempted.add(pid);
        }
      }

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

exports.getProblemBySlug = async (req, res) => {
  try {
    const problem = await Problem.findOne({ slug: req.params.slug });
    if (!problem) return res.status(404).json({ message: 'Problem not found' });

    // Surface how many hidden test cases exist without leaking their contents.
    const hiddenTestCount = await Testcase.countDocuments({
      problemId: problem._id,
      isPublic: false,
    });

    res.json({ ...problem.toObject(), hiddenTestCount });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
