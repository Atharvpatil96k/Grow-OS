'use strict';

const Redis = require('ioredis');
const logger = require('../utils/logger');
const { config } = require('../config/env');

/** @type {Redis | null} */
let redisClient = null;

/** @type {Map<string, any>} In-memory fallback store */
const memoryStore = new Map();
let usingFallback = false;

/**
 * Initialise Redis connection. Falls back to in-memory store if Redis is unavailable.
 * @returns {Promise<void>}
 */
async function initRedis() {
  try {
    redisClient = new Redis(config.redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 3 ? null : times * 200),
      enableOfflineQueue: false,
    });

    redisClient.on('error', (err) => {
      if (!usingFallback) {
        logger.warn('Redis error — switching to in-memory fallback', { error: err.message });
        usingFallback = true;
      }
    });

    redisClient.on('connect', () => {
      usingFallback = false;
      logger.info('Redis connected');
    });

    await redisClient.connect();
  } catch (err) {
    logger.warn('Redis unavailable — using in-memory session store (not suitable for multi-instance)', {
      error: err.message,
    });
    usingFallback = true;
    redisClient = null;
  }
}

/**
 * Store a session value in Redis (or in-memory fallback).
 * @param {string} key
 * @param {any} value
 * @param {number} [ttl] - TTL in seconds (defaults to config value)
 * @returns {Promise<void>}
 */
async function setSession(key, value, ttl = config.redis.sessionTTL) {
  const serialized = JSON.stringify(value);

  if (!usingFallback && redisClient) {
    await redisClient.set(`growos:session:${key}`, serialized, 'EX', ttl);
  } else {
    memoryStore.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  }
}

/**
 * Retrieve a session value from Redis (or in-memory fallback).
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function getSession(key) {
  if (!usingFallback && redisClient) {
    const raw = await redisClient.get(`growos:session:${key}`);
    return raw ? JSON.parse(raw) : null;
  }

  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Delete a session.
 * @param {string} key
 * @returns {Promise<void>}
 */
async function deleteSession(key) {
  if (!usingFallback && redisClient) {
    await redisClient.del(`growos:session:${key}`);
  } else {
    memoryStore.delete(key);
  }
}

/**
 * Check if a session exists.
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function hasSession(key) {
  const val = await getSession(key);
  return val !== null;
}

/**
 * Gracefully close the Redis connection.
 * @returns {Promise<void>}
 */
async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
}

module.exports = { initRedis, setSession, getSession, deleteSession, hasSession, closeRedis };
