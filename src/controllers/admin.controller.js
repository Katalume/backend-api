const User = require('../models/User');
const Problem = require('../models/Problem');
const Submission = require('../models/Submission');

exports.getStats = async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        const problemCount = await Problem.countDocuments({ archivedAt: null });
        const submissionCount = await Submission.countDocuments();

        res.json({
            users: userCount,
            problems: problemCount,
            submissions: submissionCount
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getAuditEvents = async (req, res) => {
    const AuditEvent = require('../models/AuditEvent');
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const filter = {};
    if (req.query.before) {
        const before = new Date(req.query.before);
        if (Number.isNaN(before.valueOf())) return res.status(400).json({ message: 'Invalid before cursor' });
        filter.createdAt = { $lt: before };
    }
    const events = await AuditEvent.find(filter)
        .populate('actorId', 'username email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    return res.json(events);
};
