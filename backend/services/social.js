'use strict';

const axios = require('axios');
const { TwitterApi } = require('twitter-api-v2');
const { config } = require('../config/env');
const logger = require('../utils/logger');

/**
 * Post content to Facebook Page.
 * @param {string} caption
 * @param {string} [imageUrl]
 * @returns {Promise<{ success: boolean, post_id?: string, error?: string }>}
 */
async function postToFacebook(caption, imageUrl) {
  const { pageAccessToken, pageId } = config.facebook;

  if (!pageAccessToken || !pageId) {
    return {
      success: false,
      error: 'Facebook credentials not configured. Add FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_ID to .env',
    };
  }

  try {
    let endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;
    let data = { message: caption, access_token: pageAccessToken };

    if (imageUrl) {
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
      data = { message: caption, url: imageUrl, access_token: pageAccessToken };
    }

    const response = await axios.post(endpoint, data);
    logger.info('Facebook post published', { post_id: response.data.id || response.data.post_id });
    return { success: true, post_id: response.data.id || response.data.post_id };
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    logger.error('Facebook post failed', { error: errMsg });
    return { success: false, error: errMsg };
  }
}

/**
 * Post content to Instagram Business Account (requires image URL).
 * @param {string} caption
 * @param {string} imageUrl
 * @returns {Promise<{ success: boolean, post_id?: string, error?: string }>}
 */
async function postToInstagram(caption, imageUrl) {
  const { pageAccessToken } = config.facebook;
  const { accountId } = config.instagram;

  if (!pageAccessToken || !accountId) {
    return {
      success: false,
      error: 'Instagram credentials not configured. Add FACEBOOK_PAGE_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID to .env',
    };
  }

  if (!imageUrl) {
    return { success: false, error: 'Instagram requires an image URL for posting' };
  }

  try {
    // Step 1: Create media container
    const containerRes = await axios.post(
      `https://graph.facebook.com/v19.0/${accountId}/media`,
      { image_url: imageUrl, caption, access_token: pageAccessToken }
    );

    const creationId = containerRes.data.id;

    // Step 2: Publish the container
    const publishRes = await axios.post(
      `https://graph.facebook.com/v19.0/${accountId}/media_publish`,
      { creation_id: creationId, access_token: pageAccessToken }
    );

    logger.info('Instagram post published', { post_id: publishRes.data.id });
    return { success: true, post_id: publishRes.data.id };
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    logger.error('Instagram post failed', { error: errMsg });
    return { success: false, error: errMsg };
  }
}

/**
 * Post a tweet to X/Twitter.
 * Caption is auto-truncated to 280 characters.
 * @param {string} caption
 * @returns {Promise<{ success: boolean, tweet_id?: string, error?: string }>}
 */
async function postToTwitter(caption) {
  const { apiKey, apiSecret, accessToken, accessSecret } = config.twitter;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return {
      success: false,
      error: 'Twitter credentials not configured. Add all TWITTER_* vars to .env',
    };
  }

  try {
    const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret });
    const text = caption.length > 280 ? caption.substring(0, 277) + '...' : caption;
    const tweet = await client.v2.tweet(text);
    logger.info('Twitter post published', { tweet_id: tweet.data.id });
    return { success: true, tweet_id: tweet.data.id };
  } catch (err) {
    logger.error('Twitter post failed', { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Returns which social platforms have credentials configured.
 * @returns {{ facebook: boolean, instagram: boolean, twitter: boolean }}
 */
function getSocialStatus() {
  return {
    facebook: !!(config.facebook.pageAccessToken && config.facebook.pageId),
    instagram: !!(config.facebook.pageAccessToken && config.instagram.accountId),
    twitter: !!(
      config.twitter.apiKey &&
      config.twitter.apiSecret &&
      config.twitter.accessToken &&
      config.twitter.accessSecret
    ),
  };
}

module.exports = { postToFacebook, postToInstagram, postToTwitter, getSocialStatus };
