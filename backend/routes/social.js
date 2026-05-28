'use strict';

const express = require('express');
const { publish, socialStatus, unsplashSearch, publishHistory } = require('../controllers/publishController');
const { validate, publishSchema, unsplashSchema } = require('../validators/schemas');

const router = express.Router();

/** Manual publish — user-initiated ONLY */
router.post('/publish', validate(publishSchema), publish);

/** Unsplash image search */
router.post('/unsplash-search', validate(unsplashSchema), unsplashSearch);

/** Social platform connection status */
router.get('/social-status', socialStatus);

/** Publish history for a session */
router.get('/publish-history/:session_id', publishHistory);

module.exports = router;
