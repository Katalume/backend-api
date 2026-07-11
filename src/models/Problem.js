const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    required: true
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium'
  },
  tags: [{
    type: String
  }],
  // Code shown in the editor when a user opens the problem.
  starterCode: {
    type: String,
    default: ''
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
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Problem', problemSchema);
