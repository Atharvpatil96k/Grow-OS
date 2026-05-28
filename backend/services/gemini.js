'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config/env');
const logger = require('../utils/logger');

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const model = genAI.getGenerativeModel({ model: config.gemini.model });

/**
 * Call Gemini and return raw text.
 * @param {string} prompt
 * @param {number} [retries=2]
 * @returns {Promise<string>}
 */
async function callGemini(prompt, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (err) {
      logger.error(`Gemini attempt ${attempt + 1} failed`, { error: err.message });
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

/**
 * Call Gemini and parse the response as JSON.
 * Strips markdown code fences before parsing.
 * @param {string} prompt
 * @param {number} [retries=2]
 * @returns {Promise<any>}
 */
async function callGeminiJSON(prompt, retries = 2) {
  const text = await callGemini(prompt, retries);

  // Strip markdown fences
  const jsonMatch =
    text.match(/```json\s*([\s\S]*?)\s*```/) ||
    text.match(/```\s*([\s\S]*?)\s*```/) ||
    [null, text];

  const clean = (jsonMatch[1] || text).trim();

  // Find JSON boundaries
  const startBrace = clean.indexOf('{');
  const startBracket = clean.indexOf('[');
  let start = -1;

  if (startBrace === -1) start = startBracket;
  else if (startBracket === -1) start = startBrace;
  else start = Math.min(startBrace, startBracket);

  const endBrace = clean.lastIndexOf('}');
  const endBracket = clean.lastIndexOf(']');
  const end = Math.max(endBrace, endBracket);

  if (start === -1 || end === -1) {
    throw new Error('No JSON found in Gemini response');
  }

  return JSON.parse(clean.substring(start, end + 1));
}

module.exports = { callGemini, callGeminiJSON };
