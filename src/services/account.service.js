const User = require('../models/User');
const Session = require('../models/Session');
const Submission = require('../models/Submission');
const EvaluationJob = require('../models/EvaluationJob');
const Leaderboard = require('../models/Leaderboard');
const Contest = require('../models/Contest');
const AuditEvent = require('../models/AuditEvent');

async function deleteUserData(userId) {
    await Promise.all([
        Submission.deleteMany({ userId }),
        EvaluationJob.deleteMany({ userId }),
        Leaderboard.deleteMany({ userId }),
        Session.deleteMany({ userId }),
        Contest.updateMany({ participants: userId }, { $pull: { participants: userId } }),
        AuditEvent.updateMany({ actorId: userId }, { $set: { actorDeleted: true } }),
    ]);
    return User.deleteOne({ _id: userId });
}

module.exports = { deleteUserData };
