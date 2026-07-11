const Problem = require('../models/Problem');
const Testcase = require('../models/Testcase');
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

exports.getProblems = async (req, res) => {
  try {
    const problems = await Problem.find({}, 'title slug difficulty tags');
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
