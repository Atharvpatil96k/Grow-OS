'use strict';

require('dotenv').config();

/**
 * Required environment variables that must be present at startup.
 * The app will exit immediately if any of these are missing.
 * @type {string[]}
 */
const REQUIRED_VARS = ['GEMINI_API_KEY'];

/**
 * Optional vars — logged as warnings if missing but app still starts.
 * @type {string[]}
 */
const OPTIONAL_VARS = [
  'UNSPLASH_ACCESS_KEY',
  'FACEBOOK_PAGE_ACCESS_TOKEN',
  'FACEBOOK_PAGE_ID',
  'INSTAGRAM_ACCOUNT_ID',
  'TWITTER_API_KEY',
  'TWITTER_API_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_SECRET',
  'REDIS_URL',
  'ALLOWED_ORIGIN',
];

/**
 * Validates environment variables on startup.
 * Exits with code 1 if required vars are missing.
 * @param {import('winston').Logger} logger
 */
function validateEnv(logger) {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    logger.error('Missing required environment variables', { missing });
    logger.error('Please check your .env file against .env.example');
    process.exit(1);
  }

  const missingOptional = OPTIONAL_VARS.filter((v) => !process.env[v]);
  if (missingOptional.length > 0) {
    logger.warn('Optional environment variables not set — some features may be disabled', {
      missingOptional,
    });
  }

  logger.info('Environment validation passed');
}

/** @type {Object} Centralised config object */
const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: 'gemini-1.5-flash-latest',
  },

  unsplash: {
    accessKey: process.env.UNSPLASH_ACCESS_KEY || '',
  },

  facebook: {
    pageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
    pageId: process.env.FACEBOOK_PAGE_ID || '',
  },

  instagram: {
    accountId: process.env.INSTAGRAM_ACCOUNT_ID || '',
  },

  twitter: {
    apiKey: process.env.TWITTER_API_KEY || '',
    apiSecret: process.env.TWITTER_API_SECRET || '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
    accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    sessionTTL: 86400, // 24 hours in seconds
  },

  cors: {
    allowedOrigin: process.env.ALLOWED_ORIGIN || 'http://localhost:3001',
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
  },
};

module.exports = { config, validateEnv };
