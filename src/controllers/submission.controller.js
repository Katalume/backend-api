const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Problem = require('../models/Problem');
const Testcase = require('../models/Testcase');
const Contest = require('../models/Contest');
const EvaluationJob = require('../models/EvaluationJob');
const { enqueueJob } = require('../services/evaluation.service');
const { validateExecutionInput } = require('../utils/codeGuard');

function validId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

exports.submitCode = async (req, res) => {
  let submission;
  try {
    const { problemId, contestId, code, languageId } = req.body;
    const userId = req.user.id;
    const idempotencyKey = req.get('idempotency-key')?.trim();

    const check = validateExecutionInput({ code, languageId });
    if (!check.ok) return res.status(check.status).json({ message: check.message });
    if (!validId(problemId) || (contestId && !validId(contestId))) {
      return res.status(400).json({ message: 'A valid problemId and contestId are required' });
    }
    if (idempotencyKey && idempotencyKey.length > 128) {
      return res.status(400).json({ message: 'Idempotency-Key must be at most 128 characters' });
    }

    if (idempotencyKey) {
      const existing = await Submission.findOne({ userId, idempotencyKey });
      if (existing) return res.status(200).json(existing);
    }

    const problem = await Problem.findOne({ _id: problemId, archivedAt: null });
    if (!problem) return res.status(404).json({ message: 'Problem not found' });

    if (contestId) {
      const now = new Date();
      const eligible = await Contest.exists({
        _id: contestId,
        startTime: { $lte: now },
        endTime: { $gte: now },
        participants: userId,
        problems: problemId,
      });
      if (!eligible) {
        return res.status(403).json({ message: 'Contest is not active or the user/problem is not eligible' });
      }
    }

    const testcases = await Testcase.find({ problemId, version: problem.testcaseVersion }).lean();
    if (testcases.length === 0) return res.status(409).json({ message: 'Problem is not ready for evaluation' });

    submission = await Submission.create({
      userId,
      problemId,
      contestId: contestId || null,
      idempotencyKey,
      code,
      languageId: check.languageId,
      status: 'Queued',
    });
    await enqueueJob({
      kind: 'submission',
      userId,
      submissionId: submission._id,
      sourceCode: code,
      languageId: check.languageId,
      testcases: testcases.map((testcase) => ({
        stdin: testcase.input,
        expectedOutput: testcase.expectedOutput,
        cpuTimeLimit: testcase.timeLimit,
        memoryLimit: testcase.memoryLimit,
      })),
    });
    res.location(`/api/submissions/${submission._id}`);
    return res.status(202).json(submission);
  } catch (error) {
    if (error?.code === 11000 && req.get('idempotency-key')) {
      const existing = await Submission.findOne({
        userId: req.user.id,
        idempotencyKey: req.get('idempotency-key').trim(),
      });
      return res.status(200).json(existing);
    }
    if (submission?._id && !(await EvaluationJob.exists({ submissionId: submission._id }))) {
      await Submission.deleteOne({ _id: submission._id });
    }
    return res.status(500).json({ message: 'Server error while queuing submission' });
  }
};

exports.getSubmission = async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid submission id' });
  const submission = await Submission.findOne({ _id: req.params.id, userId: req.user.id })
    .populate('problemId', 'title slug difficulty');
  if (!submission) return res.status(404).json({ message: 'Submission not found' });
  return res.json(submission);
};

exports.getSubmissions = async (req, res) => {
  try {
    const filter = { userId: req.user.id };
    if (req.query.problemId) {
      if (!validId(req.query.problemId)) return res.status(400).json({ message: 'Invalid problemId' });
      filter.problemId = req.query.problemId;
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    if (req.query.before) {
      const before = new Date(req.query.before);
      if (Number.isNaN(before.valueOf())) return res.status(400).json({ message: 'Invalid before cursor' });
      filter.createdAt = { $lt: before };
    }
    const submissions = await Submission.find(filter)
      .populate('problemId', 'title slug difficulty')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit);
    return res.json(submissions);
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.cancelSubmission = async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid submission id' });
  const submission = await Submission.findOne({
    _id: req.params.id,
    userId: req.user.id,
    status: 'Queued',
  });
  if (!submission) return res.status(409).json({ message: 'Only queued submissions can be cancelled' });
  const cancelled = await EvaluationJob.updateOne(
    { submissionId: submission._id, status: 'queued' },
    { status: 'dead-letter', lastError: 'Cancelled by user' }
  );
  if (cancelled.modifiedCount !== 1) {
    return res.status(409).json({ message: 'Submission evaluation has already started' });
  }
  submission.status = 'Cancelled';
  submission.errorMessage = 'Cancelled by user';
  await submission.save();
  return res.json(submission);
};
