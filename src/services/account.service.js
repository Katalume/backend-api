const crypto = require('crypto');
const User = require('../models/User');
const Session = require('../models/Session');
const Submission = require('../models/Submission');
const EvaluationJob = require('../models/EvaluationJob');
const Leaderboard = require('../models/Leaderboard');
const Contest = require('../models/Contest');
const AuditEvent = require('../models/AuditEvent');
const BillingCustomer = require('../models/BillingCustomer');
const BillingSubscription = require('../models/BillingSubscription');
const BillingPurchase = require('../models/BillingPurchase');
const BillingTransaction = require('../models/BillingTransaction');
const EntitlementGrant = require('../models/EntitlementGrant');
const { BILLING_ENABLED, BILLING_PROVIDER } = require('../config/env');
const cashfree = require('../billing/providers/cashfree.adapter');

async function deleteUserData(userId) {
    const deletedIdentity = String(userId);
    const renewableSubscriptions = await BillingSubscription.find({
        userId,
        status: { $in: ['pending', 'active', 'past_due', 'paused'] },
        cancelAtPeriodEnd: false,
    });
    if (renewableSubscriptions.length && (!BILLING_ENABLED || BILLING_PROVIDER !== 'cashfree')) {
        const error = new Error('Cancel the active membership before deleting this account.');
        error.status = 409;
        error.code = 'ACTIVE_SUBSCRIPTION';
        throw error;
    }
    for (const subscription of renewableSubscriptions) {
        await cashfree.cancelSubscription(
            subscription.providerSubscriptionId,
            crypto.randomUUID(),
            `account-delete-${deletedIdentity}`
        );
        subscription.cancelAtPeriodEnd = true;
        subscription.cancelledAt = new Date();
        await subscription.save();
    }

    await Promise.all([
        Submission.deleteMany({ userId }),
        EvaluationJob.deleteMany({ userId }),
        Leaderboard.deleteMany({ userId }),
        Session.deleteMany({ userId }),
        EntitlementGrant.deleteMany({ userId }),
        Contest.updateMany({ participants: userId }, { $pull: { participants: userId } }),
        AuditEvent.updateMany({ actorId: userId }, { $set: { actorDeleted: true } }),
        BillingCustomer.updateMany({ userId }, {
            $set: {
                billingName: 'Deleted Katalume user',
                billingEmail: `deleted+${deletedIdentity}@invalid.katalume`,
                billingPhone: '0000000000',
            },
        }),
        BillingSubscription.updateMany({ userId }, {
            $set: { customerDeleted: true },
        }),
        BillingPurchase.updateMany({ userId }, {
            $set: { customerDeleted: true },
        }),
        BillingTransaction.updateMany({ userId }, {
            $set: { customerDeleted: true },
        }),
    ]);
    return User.deleteOne({ _id: userId });
}

module.exports = { deleteUserData };
