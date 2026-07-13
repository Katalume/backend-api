const mongoose = require('mongoose');

const leaderboardSchema = new mongoose.Schema({
  contestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contest',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  score: {
    type: Number,
    default: 0
  },
  problemsSolved: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem'
  }],
  lastSubmissionTime: {
    type: Date
  }
});

leaderboardSchema.index({ contestId: 1, userId: 1 }, { unique: true });
// Compound index for efficient leaderboard queries
leaderboardSchema.index({ contestId: 1, score: -1, lastSubmissionTime: 1 });

module.exports = mongoose.model('Leaderboard', leaderboardSchema);
