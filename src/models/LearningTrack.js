const mongoose = require('mongoose');

const learningTrackSchema = new mongoose.Schema({
  slug: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160,
    unique: true,
    lowercase: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
    maxlength: 10000,
  },
  tags: [{ type: String }],
  // Lesson titles for this track.
  lessons: [{ type: String }],
  order: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

learningTrackSchema.index({ order: 1, _id: 1 });

module.exports = mongoose.model('LearningTrack', learningTrackSchema);
