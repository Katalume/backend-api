const LearningTrack = require('../models/LearningTrack');
const { slugify, generateUniqueSlug } = require('../utils/slug');
const { sendMongooseError } = require('../utils/mongoErrors');

// Admin: create a learning track. Slug is generated from the title.
exports.createTrack = async (req, res) => {
    try {
        const { title, description, tags, lessons, order } = req.body;
        if (!title) {
            return res.status(400).json({ message: 'title is required' });
        }
        const slug = await generateUniqueSlug(LearningTrack, slugify(title));
        const track = await LearningTrack.create({
            slug,
            title,
            description,
            tags: Array.isArray(tags) ? tags : [],
            lessons: Array.isArray(lessons) ? lessons : [],
            order: typeof order === 'number' ? order : 0,
        });
        res.status(201).json({
            id: track._id,
            slug: track.slug,
            title: track.title,
            description: track.description,
            tags: track.tags,
            lessons: track.lessons,
            order: track.order,
            lessonCount: track.lessons.length,
        });
    } catch (err) {
        sendMongooseError(res, err);
    }
};

// Public: list learning tracks (content managed via the seed script / admin).
exports.getTracks = async (req, res) => {
    try {
        const tracks = await LearningTrack.find().sort({ order: 1, createdAt: 1 }).lean();
        const result = tracks.map((track) => ({
            id: track._id,
            slug: track.slug,
            title: track.title,
            description: track.description,
            tags: track.tags || [],
            lessons: track.lessons || [],
            order: track.order,
            lessonCount: (track.lessons || []).length,
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateTrack = async (req, res) => {
    try {
        const allowedFields = ['title', 'description', 'tags', 'lessons', 'order'];
        const updates = {};
        for (const field of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                updates[field] = req.body[field];
            }
        }
        const track = await LearningTrack.findByIdAndUpdate(req.params.id, updates, {
            returnDocument: 'after',
            runValidators: true,
        });
        if (!track) return res.status(404).json({ message: 'Learning track not found' });
        res.json({
            id: track._id,
            slug: track.slug,
            title: track.title,
            description: track.description,
            tags: track.tags,
            lessons: track.lessons,
            order: track.order,
            lessonCount: track.lessons.length,
        });
    } catch (err) {
        sendMongooseError(res, err);
    }
};

exports.deleteTrack = async (req, res) => {
    try {
        const track = await LearningTrack.findByIdAndDelete(req.params.id);
        if (!track) return res.status(404).json({ message: 'Learning track not found' });
        res.json({ message: 'Learning track deleted' });
    } catch (err) {
        sendMongooseError(res, err);
    }
};
