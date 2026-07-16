const express = require('express');
const router = express.Router();
const importAuth = require('../middleware/importAuth');
const { importProblems, ImportValidationError } = require('../services/problemImport.service');
const logger = require('../utils/logger');

// Content-pipeline import (ml-problems CI). Mounted BEFORE the global 100kb
// JSON parser in app.js because a full catalog bundle is several MB; auth runs
// first so unauthenticated callers never reach the large-body parser.
router.post(
    '/problems',
    importAuth,
    express.json({ limit: '25mb' }),
    async (req, res) => {
        try {
            const summary = await importProblems(req.body);
            logger.info(
                `Problem import: ${summary.created} created, ${summary.updated} updated, `
                + `${summary.unchanged} unchanged (${summary.total} total)`
            );
            return res.json(summary);
        } catch (error) {
            if (error instanceof ImportValidationError) {
                return res.status(422).json({ message: error.message });
            }
            logger.error(`Problem import failed: ${error.message}`);
            return res.status(500).json({ message: 'Import failed' });
        }
    }
);

module.exports = router;
