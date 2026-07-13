const mongoose = require('mongoose');

const contestSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 160
  },
  description: {
    type: String,
    maxlength: 10000
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  problems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem'
  }],
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

contestSchema.path('endTime').validate(function validateEndTime(value) {
  return !this.startTime || value > this.startTime;
}, 'endTime must be after startTime');

contestSchema.index({ startTime: 1, endTime: 1 });
contestSchema.index({ participants: 1, endTime: 1 });

module.exports = mongoose.model('Contest', contestSchema);
