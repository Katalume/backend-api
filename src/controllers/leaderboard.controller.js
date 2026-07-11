const Submission = require('../models/Submission');

// Global leaderboard: users ranked by the number of distinct problems they have
// solved (an Accepted submission counts a problem once, no matter how many times
// it was submitted).
exports.getGlobalLeaderboard = async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 20, 100);

        const rows = await Submission.aggregate([
            { $match: { status: 'Accepted' } },
            // Collapse to distinct (user, problem) pairs.
            { $group: { _id: { user: '$userId', problem: '$problemId' } } },
            // Count distinct solved problems per user.
            { $group: { _id: '$_id.user', solved: { $sum: 1 } } },
            { $sort: { solved: -1, _id: 1 } },
            { $limit: limit },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user',
                },
            },
            { $unwind: '$user' },
            { $project: { _id: 0, userId: '$_id', username: '$user.username', solved: 1 } },
        ]);

        res.json(rows.map((row, index) => ({ rank: index + 1, ...row })));
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};
