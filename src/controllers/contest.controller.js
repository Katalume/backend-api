const Contest = require('../models/Contest');
const Leaderboard = require('../models/Leaderboard');
const { sendMongooseError } = require('../utils/mongoErrors');

exports.createContest = async (req, res) => {
    try {
        const contest = new Contest(req.body);
        await contest.save();
        res.status(201).json(contest);
    } catch (err) {
        sendMongooseError(res, err);
    }
};

exports.getAllContests = async (req, res) => {
    try {
        const contests = await Contest.find()
            .sort({ startTime: -1 })
            .select('title description startTime endTime problems participants')
            .lean();

        // Return counts rather than the full participant/problem id arrays,
        // so we don't leak every participant's user id to every client.
        const list = contests.map((contest) => ({
            _id: contest._id,
            title: contest.title,
            description: contest.description,
            startTime: contest.startTime,
            endTime: contest.endTime,
            problemCount: Array.isArray(contest.problems) ? contest.problems.length : 0,
            participantCount: Array.isArray(contest.participants) ? contest.participants.length : 0,
        }));

        res.json(list);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getContestById = async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.id)
            .populate('problems', 'title slug difficulty')
            .lean();
        if (!contest) return res.status(404).json({ message: 'Contest not found' });
        const { participants = [], ...detail } = contest;
        res.json({ ...detail, participantCount: participants.length });
    } catch (err) {
        sendMongooseError(res, err);
    }
};

exports.getContestLeaderboard = async (req, res) => {
    try {
        const exists = await Contest.exists({ _id: req.params.id });
        if (!exists) return res.status(404).json({ message: 'Contest not found' });

        const entries = await Leaderboard.find({ contestId: req.params.id })
            .populate('userId', 'username')
            .sort({ score: -1, lastSubmissionTime: 1 })
            .lean();
        res.json(entries.map((entry, index) => ({
            rank: index + 1,
            userId: entry.userId?._id || entry.userId,
            username: entry.userId?.username || 'Unknown user',
            score: entry.score,
            problemsSolved: (entry.problemsSolved || []).length,
            lastSubmissionTime: entry.lastSubmissionTime,
        })));
    } catch (err) {
        sendMongooseError(res, err);
    }
};

exports.updateContest = async (req, res) => {
    try {
        const allowedFields = ['title', 'description', 'startTime', 'endTime', 'problems'];
        const updates = {};
        for (const field of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                updates[field] = req.body[field];
            }
        }
        const contest = await Contest.findByIdAndUpdate(req.params.id, updates, {
            new: true,
            runValidators: true,
        });
        if (!contest) return res.status(404).json({ message: 'Contest not found' });
        res.json(contest);
    } catch (err) {
        sendMongooseError(res, err);
    }
};

exports.deleteContest = async (req, res) => {
    try {
        const contest = await Contest.findByIdAndDelete(req.params.id);
        if (!contest) return res.status(404).json({ message: 'Contest not found' });
        res.json({ message: 'Contest deleted' });
    } catch (err) {
        sendMongooseError(res, err);
    }
};

exports.registerForContest = async (req, res) => {
    try {
        const contest = await Contest.findById(req.params.id);
        if (!contest) return res.status(404).json({ message: 'Contest not found' });
        
        if (contest.participants.some((p) => String(p) === String(req.user.id))) {
            return res.status(400).json({ message: 'Already registered' });
        }

        contest.participants.push(req.user.id);
        await contest.save();
        res.json({ message: 'Registered successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
