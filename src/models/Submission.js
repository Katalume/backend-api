const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  problemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    required: true
  },
  contestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contest',
    default: null
  },
  idempotencyKey: {
    type: String,
    trim: true,
    maxlength: 128
  },
  code: {
    type: String,
    required: true
  },
  languageId: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: [
      'Queued', 'Processing', 'Cancelled', 'Accepted', 'Wrong Answer', 'Time Limit Exceeded',
      'Compilation Error', 'Runtime Error', 'Internal Error', 'Output Limit Exceeded',
      'Runtime Error (NZEC)', 'Runtime Error (SIGSEGV)', 'Runtime Error (SIGXFSZ)',
      'Runtime Error (SIGFPE)', 'Runtime Error (SIGABRT)', 'Runtime Error (Other)',
      'Exec Format Error'
    ],
    default: 'Queued'
  },
  runtime: {
    type: Number, // in seconds or milliseconds
    default: 0
  },
  memory: {
    type: Number, // in KB
    default: 0
  },
  errorMessage: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

submissionSchema.index({ userId: 1, createdAt: -1 });
submissionSchema.index({ userId: 1, problemId: 1, createdAt: -1 });
submissionSchema.index({ contestId: 1, userId: 1, createdAt: 1 }, { sparse: true });
submissionSchema.index({ status: 1, userId: 1, problemId: 1 });
submissionSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.model('Submission', submissionSchema);
