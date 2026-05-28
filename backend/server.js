'use strict';

// ─── Bootstrap ────────────────────────────────────────────────────────────────
require('dotenv').config();

const logger = require('./utils/logger');
const { config, validateEnv } = require('./config/env');

// Validate required environment variables before anything else
validateEnv(logger);

// ─── Imports ──────────────────────────────────────────────────────────────────
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { initRedis, closeRedis } = require('./utils/session');
const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler } = require('./middleware/errorHandler');
const chatRoutes = require('./routes/chat');
const socialRoutes = require('./routes/social');
const { success } = require('./utils/response');

// ─── App Setup ────────────────────────────────────────────────────────────────
const app = express();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
        fontSrc: ["'self'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:', 'https://images.unsplash.com', 'https://api.unsplash.com'],
        connectSrc: ["'self'", 'https://api.unsplash.com'],
      },
    },
  })
);

// CORS — whitelist only
const allowedOrigins = config.cors.allowedOrigin
  ? config.cors.allowedOrigin.split(',').map((o) => o.trim())
  : ['http://localhost:3001'];

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, same-origin)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      logger.warn('CORS blocked', { origin });
      return cb(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later.' } },
});
app.use('/api/', limiter);

// Body parsing — limit payload size
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// Request ID & logging
app.use(requestLogger);

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', chatRoutes);
app.use('/api', socialRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  return success(res, {
    status: 'ok',
    engine: 'Gemini 1.5 Flash',
    gemini_configured: !!config.gemini.apiKey,
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  });
});

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Startup ──────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initRedis();

    const server = app.listen(config.port, () => {
      logger.info(`GrowOS backend started`, {
        port: config.port,
        env: config.nodeEnv,
        url: `http://localhost:${config.port}`,
      });
    });

    // ─── Graceful Shutdown ────────────────────────────────────────────────────
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(async () => {
        await closeRedis();
        logger.info('Server closed');
        process.exit(0);
      });
      // Force shutdown after 10 s
      setTimeout(() => process.exit(1), 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { error: err.message, stack: err.stack });
      process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled promise rejection', { reason: String(reason) });
    });

    return server;
  } catch (err) {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
  }
}

start();

module.exports = app; // exported for testing
