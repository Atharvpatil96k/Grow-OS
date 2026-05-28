'use strict';

const axios = require('axios');
const { getSession, setSession } = require('../utils/session');
const { postToFacebook, postToInstagram, postToTwitter, getSocialStatus } = require('../services/social');
const { config } = require('../config/env');
const { success, fail } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * POST /api/publish
 *
 * MANUAL-ONLY publishing endpoint.
 * This is the ONLY way content gets posted to social media.
 * NO automatic triggers exist in this codebase.
 *
 * The user MUST explicitly click "Publish" in the UI, which calls this endpoint.
 * The frontend shows a confirmation modal before this request is made.
 */
async function publish(req, res, next) {
  try {
    const { session_id, platform, caption, image_url } = req.body;

    // Validate session exists
    const session = await getSession(session_id);
    if (!session) {
      return fail(res, 'SESSION_NOT_FOUND', 'No active session found. Please start a new conversation.', 400);
    }

    logger.info('Manual publish triggered', { session_id, platform });

    let result;
    switch (platform) {
      case 'facebook':
        result = await postToFacebook(caption, image_url);
        break;
      case 'instagram':
        result = await postToInstagram(caption, image_url);
        break;
      case 'twitter':
        result = await postToTwitter(caption);
        break;
      default:
        return fail(res, 'INVALID_PLATFORM', `Unknown platform: ${platform}`, 400);
    }

    // Record publish history in session
    if (!session.publishHistory) session.publishHistory = [];
    session.publishHistory.push({
      platform,
      caption: caption.substring(0, 100),
      success: result.success,
      timestamp: new Date().toISOString(),
      post_id: result.post_id || result.tweet_id || null,
    });
    await setSession(session_id, session);

    if (result.success) {
      logger.info('Publish successful', { platform, session_id });
      return success(res, { platform, result });
    }

    logger.warn('Publish failed', { platform, error: result.error });
    return fail(res, 'PUBLISH_FAILED', result.error || 'Publishing failed', 500);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/social-status
 * Returns which social accounts have credentials configured.
 */
function socialStatus(_req, res) {
  return success(res, getSocialStatus());
}

/**
 * POST /api/unsplash-search
 * Search Unsplash for images to attach to posts.
 */
async function unsplashSearch(req, res, next) {
  try {
    const { query } = req.body;
    const key = config.unsplash.accessKey;

    if (!key) {
      return fail(res, 'UNSPLASH_NOT_CONFIGURED', 'Unsplash API key not configured', 400);
    }

    const response = await axios.get('https://api.unsplash.com/search/photos', {
      params: { query, per_page: 6, orientation: 'squarish' },
      headers: { Authorization: `Client-ID ${key}` },
    });

    const images = response.data.results.map((img) => ({
      id: img.id,
      url: img.urls.regular,
      thumb: img.urls.thumb,
      alt: img.alt_description,
      credit: img.user.name,
    }));

    return success(res, { images });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/publish-history/:session_id
 * Returns publish history for a session.
 */
async function publishHistory(req, res, next) {
  try {
    const { session_id } = req.params;
    const session = await getSession(session_id);
    if (!session) {
      return fail(res, 'SESSION_NOT_FOUND', 'Session not found', 404);
    }
    return success(res, { history: session.publishHistory || [] });
  } catch (err) {
    next(err);
  }
}

module.exports = { publish, socialStatus, unsplashSearch, publishHistory };
