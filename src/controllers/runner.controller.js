const mongoose = require('mongoose');
const EvaluationJob = require('../models/EvaluationJob');
const Problem = require('../models/Problem');
const Testcase = require('../models/Testcase');
const { enqueueJob, publicJob } = require('../services/evaluation.service');
const { validateExecutionInput } = require('../utils/codeGuard');

exports.runCode = async (req, res) => {
  const { code, languageId, customInput, problemId } = req.body;
  const check = validateExecutionInput({ code, languageId });
  if (!check.ok) return res.status(check.status).json({ message: check.message });
  if (Buffer.byteLength(customInput || '', 'utf8') > 65536) {
    return res.status(413).json({ message: 'Custom input exceeds 65536 bytes' });
  }
  let testcases = [{ stdin: customInput || '', expectedOutput: null }];
  if (problemId) {
    const problem = mongoose.Types.ObjectId.isValid(problemId)
      && await Problem.findOne({ _id: problemId, archivedAt: null }).select('testcaseVersion');
    if (!problem) {
      return res.status(400).json({ message: 'A valid problemId is required' });
    }
    const publicCases = await Testcase.find({
      problemId,
      version: problem.testcaseVersion,
      isPublic: true,
    }).lean();
    if (publicCases.length) {
      testcases = publicCases.map((testcase) => ({
        stdin: testcase.input,
        expectedOutput: testcase.expectedOutput,
        cpuTimeLimit: testcase.timeLimit,
        memoryLimit: testcase.memoryLimit,
      }));
    }
  }
  const job = await enqueueJob({
    kind: 'run',
    userId: req.user.id,
    sourceCode: code,
    languageId: check.languageId,
    testcases,
  });
  res.location(`/api/runner/jobs/${job._id}`);
  return res.status(202).json(publicJob(job));
};

exports.getRun = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid evaluation job id' });
  }
  const job = await EvaluationJob.findOne({ _id: req.params.id, userId: req.user.id, kind: 'run' });
  if (!job) return res.status(404).json({ message: 'Evaluation job not found' });
  res.set('Cache-Control', 'no-store');
  return res.json(publicJob(job));
};
