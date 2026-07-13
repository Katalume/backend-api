const { enqueueJob } = require('../services/evaluation.service');

module.exports = { addToQueue: enqueueJob };
