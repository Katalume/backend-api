const mongoose = require('mongoose');

const testcaseSchema = new mongoose.Schema({
  problemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    required: true
  },
  version: {
    type: Number,
    default: 1,
    min: 1
  },
  input: {
    type: String,
    required: true,
    maxlength: 1048576
  },
  expectedOutput: {
    type: String,
    required: true,
    maxlength: 1048576
  },
  isPublic: {
    type: Boolean,
    default: false // If true, can be shown as a sample
  },
  timeLimit: {
    type: Number,
    default: 2.0, // seconds
    min: 0.1,
    max: 30
  },
  memoryLimit: {
    type: Number,
    default: 128000, // kilobytes
    min: 16000,
    max: 512000
  }
});

testcaseSchema.index({ problemId: 1, version: 1, isPublic: 1 });

module.exports = mongoose.model('Testcase', testcaseSchema);
