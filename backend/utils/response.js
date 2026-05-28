'use strict';

/**
 * Standard API success response.
 * @param {import('express').Response} res
 * @param {any} data
 * @param {number} [statusCode=200]
 */
function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data, error: null });
}

/**
 * Standard API error response.
 * @param {import('express').Response} res
 * @param {string} code  - Machine-readable error code (e.g. 'VALIDATION_ERROR')
 * @param {string} message - Human-readable message
 * @param {number} [statusCode=400]
 */
function fail(res, code, message, statusCode = 400) {
  return res.status(statusCode).json({ success: false, data: null, error: { code, message } });
}

module.exports = { success, fail };
