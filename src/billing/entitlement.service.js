const EntitlementGrant = require('../models/EntitlementGrant');
const { FREE_PROBLEM_SLUGS } = require('../config/freeProblemSlugs');
const { PAID_ENTITLEMENTS_ENFORCED } = require('../config/env');

const BENEFIT_ALL_PROBLEMS = 'all_problems';

async function getEffectiveEntitlement(userId, now = new Date()) {
    if (!userId) {
        return {
            tier: 'free',
            benefits: [],
            startsAt: null,
            endsAt: null,
        };
    }
    const grants = await EntitlementGrant.find({
        userId,
        status: 'active',
        startsAt: { $lte: now },
        $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
    }).sort({ endsAt: -1 }).lean();

    if (!grants.length) {
        return { tier: 'free', benefits: [], startsAt: null, endsAt: null };
    }
    const lumus = grants.find((grant) => grant.tier === 'lumus');
    const selected = lumus || grants[0];
    return {
        tier: selected.tier,
        benefits: [...new Set(grants.flatMap((grant) => grant.benefits || []))],
        startsAt: selected.startsAt,
        endsAt: lumus ? null : selected.endsAt,
    };
}

function isFreeProblem(slug) {
    return FREE_PROBLEM_SLUGS.has(slug);
}

function problemAccessState(slug, hasAllProblems, enforcementEnabled = PAID_ENTITLEMENTS_ENFORCED) {
    const accessTier = isFreeProblem(slug) ? 'free' : 'plus';
    return {
        accessTier,
        locked: enforcementEnabled && accessTier === 'plus' && !hasAllProblems,
    };
}

async function canAccessProblem(userId, slug) {
    if (!PAID_ENTITLEMENTS_ENFORCED || isFreeProblem(slug)) return true;
    const entitlement = await getEffectiveEntitlement(userId);
    return entitlement.benefits.includes(BENEFIT_ALL_PROBLEMS);
}

async function annotateProblemAccess(problems, userId) {
    const entitlement = await getEffectiveEntitlement(userId);
    const hasAllProblems = entitlement.benefits.includes(BENEFIT_ALL_PROBLEMS);
    return problems.map((problem) => {
        return {
            ...problem,
            ...problemAccessState(problem.slug, hasAllProblems),
        };
    });
}

module.exports = {
    BENEFIT_ALL_PROBLEMS,
    getEffectiveEntitlement,
    isFreeProblem,
    canAccessProblem,
    annotateProblemAccess,
    problemAccessState,
};
