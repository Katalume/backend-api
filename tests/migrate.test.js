const User = require('../src/models/User');
const Contest = require('../src/models/Contest');
const Leaderboard = require('../src/models/Leaderboard');
const Problem = require('../src/models/Problem');
const { deduplicateLeaderboards } = require('../scripts/migrate');

describe('database migrations', () => {
    test('merges duplicate legacy leaderboard rows before the unique index is applied', async () => {
        const user = await User.create({
            username: 'legacy', email: 'legacy@example.com', password: 'password123',
        });
        const contest = await Contest.create({
            title: 'Legacy', startTime: new Date('2025-01-01'), endTime: new Date('2025-01-02'),
        });
        const problems = await Problem.create([
            { title: 'One', slug: 'one', description: 'd' },
            { title: 'Two', slug: 'two', description: 'd' },
        ]);
        // Bypass index enforcement to represent a pre-migration collection.
        await Leaderboard.collection.dropIndexes().catch(() => {});
        await Leaderboard.collection.insertMany([
            { contestId: contest._id, userId: user._id, score: 1, problemsSolved: [problems[0]._id] },
            { contestId: contest._id, userId: user._id, score: 1, problemsSolved: [problems[1]._id] },
        ]);
        await deduplicateLeaderboards();
        const rows = await Leaderboard.find({ contestId: contest._id, userId: user._id });
        expect(rows).toHaveLength(1);
        expect(rows[0].score).toBe(2);
        expect(rows[0].problemsSolved).toHaveLength(2);
    });
});
