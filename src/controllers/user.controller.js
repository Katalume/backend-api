const User = require('../models/User');
const Problem = require('../models/Problem');
const Submission = require('../models/Submission');
const { sendMongooseError } = require('../utils/mongoErrors');

// True when the requester is acting on their own record or is an Admin.
function canManage(req) {
    const isSelf = req.user && String(req.user.id) === String(req.params.id);
    const isAdmin = req.user && Array.isArray(req.user.roles) && req.user.roles.includes('Admin');
    return { isSelf, isAdmin, allowed: isSelf || isAdmin };
}

// Aggregate the current user's progress from their submissions.
exports.getMyStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const [totalProblems, problems, subs] = await Promise.all([
            Problem.countDocuments({ archivedAt: null }),
            Problem.find({ archivedAt: null }, 'difficulty').lean(),
            Submission.find({ userId }, 'problemId status').lean(),
        ]);

        const difficultyById = new Map(
            problems.map((p) => [String(p._id), p.difficulty || 'Medium'])
        );

        const solved = new Set();
        const attempted = new Set();
        let acceptedSubmissions = 0;
        for (const sub of subs) {
            const pid = String(sub.problemId);
            if (sub.status === 'Accepted') {
                solved.add(pid);
                acceptedSubmissions += 1;
            } else {
                attempted.add(pid);
            }
        }
        // A solved problem is not also "attempted".
        for (const pid of solved) {
            attempted.delete(pid);
        }

        const byDifficulty = {
            Easy: { solved: 0, total: 0 },
            Medium: { solved: 0, total: 0 },
            Hard: { solved: 0, total: 0 },
        };
        for (const p of problems) {
            const d = byDifficulty[p.difficulty] ? p.difficulty : 'Medium';
            byDifficulty[d].total += 1;
        }
        for (const pid of solved) {
            const d = difficultyById.get(pid);
            if (d && byDifficulty[d]) {
                byDifficulty[d].solved += 1;
            }
        }

        res.json({
            totalProblems,
            solved: solved.size,
            attempted: attempted.size,
            totalSubmissions: subs.length,
            acceptedSubmissions,
            byDifficulty,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayKey(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Weekly solved counts, current/longest streak, and per-tag topic coverage.
exports.getMyProgress = async (req, res) => {
    try {
        const userId = req.user.id;
        const [accepted, problems] = await Promise.all([
            Submission.find({ userId, status: 'Accepted' }, 'problemId createdAt').lean(),
            Problem.find({ archivedAt: null }, 'tags').lean(),
        ]);

        const solvedProblemIds = new Set(accepted.map((s) => String(s.problemId)));

        // --- Weekly: distinct problems solved per day over the last 7 days ---
        const todayStart = dayKey(new Date());
        const buckets = [];
        for (let i = 6; i >= 0; i -= 1) {
            const start = todayStart - i * DAY_MS;
            buckets.push({ start, label: WEEKDAYS[new Date(start).getDay()], solved: new Set() });
        }
        for (const sub of accepted) {
            const start = dayKey(new Date(sub.createdAt));
            const bucket = buckets.find((b) => b.start === start);
            if (bucket) bucket.solved.add(String(sub.problemId));
        }
        const weekly = buckets.map((b) => ({
            date: new Date(b.start).toISOString().slice(0, 10),
            label: b.label,
            solved: b.solved.size,
        }));

        // --- Streaks: consecutive days with at least one accepted submission ---
        const activeDays = new Set(accepted.map((s) => dayKey(new Date(s.createdAt))));

        let currentStreak = 0;
        for (let day = todayStart; activeDays.has(day); day -= DAY_MS) {
            currentStreak += 1;
        }

        let longestStreak = 0;
        for (const day of activeDays) {
            // Count a run only from its start (no earlier active day).
            if (!activeDays.has(day - DAY_MS)) {
                let run = 1;
                let next = day + DAY_MS;
                while (activeDays.has(next)) {
                    run += 1;
                    next += DAY_MS;
                }
                if (run > longestStreak) longestStreak = run;
            }
        }

        // --- Topic coverage by tag ---
        const tagTotal = new Map();
        const tagSolved = new Map();
        for (const problem of problems) {
            const isSolved = solvedProblemIds.has(String(problem._id));
            for (const tag of problem.tags || []) {
                tagTotal.set(tag, (tagTotal.get(tag) || 0) + 1);
                if (isSolved) tagSolved.set(tag, (tagSolved.get(tag) || 0) + 1);
            }
        }
        const topics = [...tagTotal.entries()]
            .map(([tag, total]) => ({ tag, total, solved: tagSolved.get(tag) || 0 }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 6);

        res.json({ weekly, currentStreak, longestStreak, topics });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
        const filter = {};
        if (req.query.before) {
            if (!require('mongoose').Types.ObjectId.isValid(req.query.before)) {
                return res.status(400).json({ message: 'Invalid before cursor' });
            }
            filter._id = { $lt: req.query.before };
        }
        const users = await User.find(filter).select('-password').sort({ _id: -1 }).limit(limit);
        if (users.length === limit) res.set('X-Next-Cursor', String(users[users.length - 1]._id));
        res.json(users);
    } catch (err) {
        sendMongooseError(res, err);
    }
};

exports.getUserById = async (req, res) => {
    try {
        // Only the owner or an Admin may read a full user record (contains email).
        if (!canManage(req).allowed) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { isAdmin, allowed } = canManage(req);
        if (!allowed) {
            return res.status(403).json({ message: 'Insufficient permissions' });
        }

        // Never allow privilege fields to be set through a self-service update.
        // `roles` may only be changed by an Admin; `password` goes through auth.
        const updateData = {};
        for (const field of ['username', 'avatarUrl']) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) updateData[field] = req.body[field];
        }
        const { roles } = req.body;
        if (roles !== undefined && isAdmin) {
            updateData.roles = roles;
        }

        const user = await User.findByIdAndUpdate(req.params.id, updateData, {
            returnDocument: 'after',
            runValidators: true,
        }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        sendMongooseError(res, err);
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        await require('../services/account.service').deleteUserData(user._id);
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
