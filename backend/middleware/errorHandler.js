'use strict';

const logger = require('../utils/logger');
const { fail } = require('../utils/response');

/**
 * Centralized error handling middleware.
 * Must be registered LAST in Express middleware chain.
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const reqId = req.id || 'unknown';

  logger.error('Unhandled error', {
    reqId,
    method: req.method,
    url: req.url,
    error: err.message,
    stack: err.stack,
  });

  if (res.headersSent) return;

  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message =
    process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message;

  return fail(res, code, message, statusCode);
}

module.exports = { errorHandler };
