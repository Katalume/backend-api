const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 50000
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium'
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  // Code shown in the editor when a user opens the problem.
  starterCode: {
    type: String,
    default: '',
    maxlength: 100000
  },
  constraints: [{
    type: String
  }],
  sampleTestCases: [{
    input: String,
    output: String,
    explanation: String
  }],
  // Optional worked solution, unlocked after an accepted submission.
  editorial: {
    summary: String,
    approach: String,
    timeComplexity: String,
    spaceComplexity: String,
    pitfalls: [String]
  },
  // References to full test cases stored separately
  testcases: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Testcase'
  }],
  testcaseVersion: {
    type: Number,
    default: 1,
    min: 1
  },
  contentVersion: {
    type: Number,
    default: 1,
    min: 1
  },
  archivedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

problemSchema.index({ tags: 1, _id: -1 });
problemSchema.index({ difficulty: 1, _id: -1 });
problemSchema.index({ archivedAt: 1, _id: -1 });

module.exports = mongoose.model('Problem', problemSchema);
