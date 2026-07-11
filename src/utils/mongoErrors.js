/**
 * Map a Mongoose/Mongo error to an appropriate HTTP response.
 * Validation errors -> 400, duplicate-key errors -> 409, otherwise 500.
 */
function sendMongooseError(res, error) {
    if (error && error.name === 'ValidationError') {
        return res.status(400).json({ message: error.message });
    }
    if (error && (error.code === 11000 || error.code === 11001)) {
        return res.status(409).json({ message: 'Duplicate value', keyValue: error.keyValue });
    }
    return res.status(500).json({ message: error && error.message ? error.message : 'Server Error' });
}

module.exports = { sendMongooseError };
