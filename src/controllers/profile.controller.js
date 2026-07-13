const User = require('../models/User');
const Problem = require('../models/Problem');
const Submission = require('../models/Submission');

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(date) {
    return new Date(date).toISOString().slice(0, 10);
}

// Rich profile for the authenticated user, computed from their submissions.
// Shape matches what the frontend Profile page expects.
exports.getMyProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const [user, problems, subs] = await Promise.all([
            User.findById(userId).select('-password').lean(),
            Problem.find({ archivedAt: null }, 'tags').lean(),
            Submission.find({ userId }, 'problemId status createdAt').lean(),
        ]);

        if (!user) return res.status(404).json({ message: 'User not found' });

        // Distinct solved problems + accepted count.
        const solvedIds = new Set();
        let acceptedCount = 0;
        for (const sub of subs) {
            if (sub.status === 'Accepted') {
                solvedIds.add(String(sub.problemId));
                acceptedCount += 1;
            }
        }
        const totalSolved = solvedIds.size;
        const acceptanceRate = subs.length
            ? Math.round((acceptedCount / subs.length) * 100)
            : 0;

        // Current streak: consecutive days (ending today) with an accepted submission.
        const activeDays = new Set(
            subs.filter((s) => s.status === 'Accepted').map((s) => isoDay(s.createdAt))
        );
        const submissionsByDay = new Map();
        for (const submission of subs) {
            const day = isoDay(submission.createdAt);
            submissionsByDay.set(day, (submissionsByDay.get(day) || 0) + 1);
        }
        const today = new Date();
        let streakDays = 0;
        for (let i = 0; ; i += 1) {
            const d = new Date(today.getTime() - i * DAY_MS);
            if (activeDays.has(isoDay(d))) streakDays += 1;
            else break;
        }

        // Heatmap: submissions per day over the last 120 days.
        const heatmap = [];
        for (let i = 119; i >= 0; i -= 1) {
            const key = isoDay(new Date(today.getTime() - i * DAY_MS));
            heatmap.push({ date: key, count: submissionsByDay.get(key) || 0 });
        }

        // Acceptance trend: monthly acceptance rate, last 6 months with activity.
        const monthMap = new Map();
        for (const sub of subs) {
            const month = new Date(sub.createdAt).toISOString().slice(0, 7);
            const entry = monthMap.get(month) || { accepted: 0, total: 0 };
            entry.total += 1;
            if (sub.status === 'Accepted') entry.accepted += 1;
            monthMap.set(month, entry);
        }
        const acceptanceTrend = [...monthMap.entries()]
            .sort(([a], [b]) => (a > b ? 1 : -1))
            .slice(-6)
            .map(([label, value]) => ({
                label,
                acceptance: value.total ? Math.round((value.accepted / value.total) * 100) : 0,
            }));

        // Topic progress by tag.
        const tagTotal = new Map();
        const tagSolved = new Map();
        for (const problem of problems) {
            const solved = solvedIds.has(String(problem._id));
            for (const tag of problem.tags || []) {
                tagTotal.set(tag, (tagTotal.get(tag) || 0) + 1);
                if (solved) tagSolved.set(tag, (tagSolved.get(tag) || 0) + 1);
            }
        }
        const topicProgress = [...tagTotal.entries()]
            .map(([topic, total]) => ({ topic, solved: tagSolved.get(topic) || 0, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 8);

        res.json({
            user: {
                id: user._id,
                name: user.username,
                email: user.email,
                avatarUrl: user.avatarUrl,
                createdAt: user.createdAt,
            },
            totalSolved,
            acceptanceRate,
            streakDays,
            heatmap,
            acceptanceTrend,
            topicProgress,
            recentContestRanks: [],
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};
