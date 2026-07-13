const Leaderboard = require('../models/Leaderboard');

async function recordAcceptedContestSubmission(submission) {
    if (!submission.contestId || submission.status !== 'Accepted') return;

    const identity = { contestId: submission.contestId, userId: submission.userId };
    try {
        await Leaderboard.updateOne(identity, {
            $setOnInsert: { score: 0, problemsSolved: [] },
        }, { upsert: true });
    } catch (error) {
        // A concurrent first solve may win the unique upsert. The guarded update
        // below remains safe and idempotent.
        if (error?.code !== 11000) throw error;
    }

    await Leaderboard.updateOne({
        ...identity,
        problemsSolved: { $ne: submission.problemId },
    }, {
        $addToSet: { problemsSolved: submission.problemId },
        $inc: { score: 1 },
        $set: { lastSubmissionTime: submission.createdAt || new Date() },
    });
}

module.exports = { recordAcceptedContestSubmission };
