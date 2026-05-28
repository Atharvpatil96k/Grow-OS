'use strict';

const express = require('express');
const { chat, regenerate, reset } = require('../controllers/chatController');
const { validate, chatSchema, regenerateSchema, resetSchema } = require('../validators/schemas');

const router = express.Router();

router.post('/chat', validate(chatSchema), chat);
router.post('/regenerate', validate(regenerateSchema), regenerate);
router.post('/reset', validate(resetSchema), reset);

module.exports = router;
