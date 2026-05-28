'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { fail } = require('../utils/response');

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(ajv);

/** @type {Object} Schema for POST /api/chat */
const chatSchema = {
  type: 'object',
  properties: {
    session_id: { type: 'string', minLength: 1, maxLength: 128 },
    message: { type: 'string', maxLength: 2000 },
  },
  required: ['session_id'],
  additionalProperties: false,
};

/** @type {Object} Schema for POST /api/regenerate */
const regenerateSchema = {
  type: 'object',
  properties: {
    session_id: { type: 'string', minLength: 1, maxLength: 128 },
    section: {
      type: 'string',
      enum: ['business_analysis', 'weekly_plan', 'captions', 'ad_recommendations', 'festival_trends'],
    },
  },
  required: ['session_id', 'section'],
  additionalProperties: false,
};

/** @type {Object} Schema for POST /api/publish */
const publishSchema = {
  type: 'object',
  properties: {
    session_id: { type: 'string', minLength: 1, maxLength: 128 },
    platform: { type: 'string', enum: ['facebook', 'instagram', 'twitter'] },
    caption: { type: 'string', minLength: 1, maxLength: 5000 },
    image_url: { type: 'string', maxLength: 2048 },
  },
  required: ['session_id', 'platform', 'caption'],
  additionalProperties: false,
};

/** @type {Object} Schema for POST /api/reset */
const resetSchema = {
  type: 'object',
  properties: {
    session_id: { type: 'string', minLength: 1, maxLength: 128 },
  },
  required: ['session_id'],
  additionalProperties: false,
};

/** @type {Object} Schema for POST /api/unsplash-search */
const unsplashSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', minLength: 1, maxLength: 200 },
  },
  required: ['query'],
  additionalProperties: false,
};

/**
 * Create an Express middleware that validates req.body against the given schema.
 * Responds with 400 if validation fails.
 * @param {Object} schema - AJV JSON Schema
 * @returns {import('express').RequestHandler}
 */
function validate(schema) {
  const compiled = ajv.compile(schema);

  return (req, res, next) => {
    const valid = compiled(req.body);
    if (!valid) {
      const message = compiled.errors
        .map((e) => `${e.instancePath || 'body'} ${e.message}`)
        .join('; ');
      return fail(res, 'VALIDATION_ERROR', message, 400);
    }
    return next();
  };
}

module.exports = {
  validate,
  chatSchema,
  regenerateSchema,
  publishSchema,
  resetSchema,
  unsplashSchema,
};
