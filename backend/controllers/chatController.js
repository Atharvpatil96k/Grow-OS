'use strict';

const { getSession, setSession } = require('../utils/session');
const {
  REQUIRED_FIELDS,
  FIELD_QUESTIONS,
  randomTransition,
  extractField,
  generateFullPlan,
  regenerateSection,
  generateFallbackPlan,
} = require('../services/plan');
const { success, fail } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * POST /api/chat
 * Conversational endpoint that collects business info step-by-step and generates the full plan.
 */
async function chat(req, res, next) {
  try {
    const { session_id, message } = req.body;

    // Get or initialise session
    let session = await getSession(session_id);
    if (!session) {
      session = { collected: {}, history: [], stage: 'questioning', generatedData: null, publishHistory: [] };
      await setSession(session_id, session);
    }

    // Welcome message (no message yet)
    if (!message) {
      const missing = REQUIRED_FIELDS.filter((f) => !session.collected[f]);
      const firstField = missing[0];
      return success(res, {
        type: 'question',
        message: `Hey! 👋 I'm GrowOS — your AI-powered growth strategist.\n\nI'll build you a complete marketing plan in under 2 minutes. Let's start!\n\n${FIELD_QUESTIONS[firstField]}`,
        field: firstField,
        progress: Math.round(((REQUIRED_FIELDS.length - missing.length) / REQUIRED_FIELDS.length) * 100),
      });
    }

    // Record user message
    session.history.push({ role: 'user', content: message });

    const missing = REQUIRED_FIELDS.filter((f) => !session.collected[f]);

    // ─── Collect fields ──────────────────────────────────────────────────────
    if (missing.length > 0 && session.stage === 'questioning') {
      const currentField = missing[0];

      try {
        const extraction = await extractField(currentField, message);

        if (extraction.is_vague && extraction.follow_up_question) {
          await setSession(session_id, session);
          return success(res, {
            type: 'follow_up',
            message: extraction.follow_up_question,
            field: currentField,
            progress: Math.round(((REQUIRED_FIELDS.length - missing.length) / REQUIRED_FIELDS.length) * 100),
          });
        }

        session.collected[currentField] = extraction.extracted_value || message;
      } catch (err) {
        logger.warn('Field extraction failed, using raw input', { error: err.message });
        session.collected[currentField] = message;
      }

      const stillMissing = REQUIRED_FIELDS.filter((f) => !session.collected[f]);

      if (stillMissing.length > 0) {
        const nextField = stillMissing[0];
        await setSession(session_id, session);
        return success(res, {
          type: 'question',
          message: `${randomTransition()}${FIELD_QUESTIONS[nextField]}`,
          field: nextField,
          progress: Math.round(((REQUIRED_FIELDS.length - stillMissing.length) / REQUIRED_FIELDS.length) * 100),
        });
      }

      // All fields collected — generate plan
      session.stage = 'generating';
      await setSession(session_id, session);

      try {
        const data = await generateFullPlan(session.collected);
        session.generatedData = data;
        session.stage = 'complete';
        await setSession(session_id, session);

        return success(res, {
          type: 'full_plan',
          message: '✨ Your complete growth plan is ready! Review each section below — you can regenerate any part or accept it.',
          data,
          business_context: session.collected,
          progress: 100,
        });
      } catch (err) {
        logger.error('Plan generation failed, using fallback', { error: err.message });
        const fallback = generateFallbackPlan(session.collected);
        session.generatedData = fallback;
        session.stage = 'complete';
        await setSession(session_id, session);

        return success(res, {
          type: 'full_plan',
          message: '✨ Your growth plan is ready! (Using enhanced templates due to high demand — insights are still customised to your inputs.)',
          data: fallback,
          business_context: session.collected,
          progress: 100,
          fallback: true,
        });
      }
    }

    // ─── Follow-up questions after plan is complete ──────────────────────────
    if (session.stage === 'complete') {
      const { callGemini } = require('../services/gemini');
      try {
        const followUpPrompt = `You are GrowOS, an AI marketing strategist. The user has a business called "${session.collected.business_name}" in the "${session.collected.industry}" industry.
Business description: ${session.collected.description}
Target audience: ${session.collected.target_audience}
Location: ${session.collected.location}
Goals: ${session.collected.goals}

The user's follow-up question: "${message}"

Respond helpfully as a marketing expert. Keep response concise and actionable.`;

        const response = await callGemini(followUpPrompt);
        await setSession(session_id, session);
        return success(res, { type: 'follow_up_answer', message: response, progress: 100 });
      } catch (err) {
        return success(res, {
          type: 'follow_up_answer',
          message: "I'm having trouble processing that right now. Could you try rephrasing your question?",
          progress: 100,
        });
      }
    }

    return fail(res, 'SESSION_ERROR', 'Something went wrong. Please refresh and try again.', 500);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/regenerate
 * Regenerates a specific section of the plan.
 */
async function regenerate(req, res, next) {
  try {
    const { session_id, section } = req.body;

    const session = await getSession(session_id);
    if (!session || !session.collected) {
      return fail(res, 'SESSION_NOT_FOUND', 'No active session found. Please start a new conversation.', 400);
    }

    const data = await regenerateSection(section, session.collected);

    // Update stored plan
    if (session.generatedData) {
      session.generatedData[section] = data;
      await setSession(session_id, session);
    }

    return success(res, { section, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/reset
 * Clears the current session.
 */
async function reset(req, res, next) {
  try {
    const { session_id } = req.body;
    const { deleteSession } = require('../utils/session');
    await deleteSession(session_id);
    return success(res, { reset: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { chat, regenerate, reset };
