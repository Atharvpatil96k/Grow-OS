'use strict';

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * Attach a unique request ID to every incoming request and log it.
 * @type {import('express').RequestHandler}
 */
function requestLogger(req, _res, next) {
  req.id = uuidv4();
  logger.info('Incoming request', {
    reqId: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip,
  });
  next();
}

module.exports = { requestLogger };
