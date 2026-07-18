const BENEFITS = Object.freeze([
    'all_problems',
    'interview_tracks',
    'premium_progress',
    'premium_profile',
]);

const OFFERS = Object.freeze([
    Object.freeze({
        offerKey: 'plus_weekly_in_v1',
        name: 'Plus Weekly',
        tier: 'plus',
        cadence: 'weekly',
        currency: 'INR',
        amountMinor: 7900,
        intervalType: 'WEEK',
        intervalCount: 1,
        maxCycles: 100,
        benefits: BENEFITS,
        status: 'active',
        popular: false,
    }),
    Object.freeze({
        offerKey: 'plus_monthly_in_v1',
        name: 'Plus Monthly',
        tier: 'plus',
        cadence: 'monthly',
        currency: 'INR',
        amountMinor: 24900,
        intervalType: 'MONTH',
        intervalCount: 1,
        maxCycles: 100,
        benefits: BENEFITS,
        status: 'active',
        popular: true,
    }),
    Object.freeze({
        offerKey: 'plus_yearly_in_v1',
        name: 'Plus Yearly',
        tier: 'plus',
        cadence: 'yearly',
        currency: 'INR',
        amountMinor: 199900,
        intervalType: 'YEAR',
        intervalCount: 1,
        maxCycles: 20,
        benefits: BENEFITS,
        status: 'active',
        popular: false,
    }),
    Object.freeze({
        offerKey: 'lumus_lifetime_in_v1',
        name: 'Lumus Lifetime',
        tier: 'lumus',
        cadence: 'lifetime',
        currency: 'INR',
        amountMinor: 499900,
        benefits: BENEFITS,
        status: 'active',
        popular: false,
    }),
]);

function publicOffer(offer) {
    return {
        offerKey: offer.offerKey,
        name: offer.name,
        tier: offer.tier,
        cadence: offer.cadence,
        currency: offer.currency,
        amountMinor: offer.amountMinor,
        benefits: offer.benefits,
        popular: offer.popular,
    };
}

function getOffer(offerKey) {
    return OFFERS.find((offer) => offer.offerKey === offerKey && offer.status === 'active');
}

module.exports = { OFFERS, getOffer, publicOffer };
