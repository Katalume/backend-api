const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 32
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        maxlength: 254,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please fill a valid email address']
    },
    password: {
        // Required for local (email/password) accounts only. Social-login
        // accounts authenticate through their provider and have no password.
        type: String,
        required: function () {
            return this.provider === 'local';
        },
        minlength: 8,
        maxlength: 128
    },
    provider: {
        type: String,
        enum: ['local', 'google', 'github'],
        default: 'local',
        required: true
    },
    // Stable per-provider account id (e.g. Google "sub" / GitHub numeric id).
    providerId: {
        type: String,
        default: null
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    roles: {
        type: [String],
        default: ['User'],
        enum: ['User', 'Organization', 'Admin']
    },
    avatarUrl: {
        type: String,
        trim: true,
        maxlength: 2048,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// One account per (provider, providerId). Partial filter so the many local
// accounts (providerId: null) are exempt from the unique constraint.
userSchema.index(
    { provider: 1, providerId: 1 },
    { unique: true, partialFilterExpression: { providerId: { $type: 'string' } } }
);

module.exports = mongoose.model('User', userSchema);
