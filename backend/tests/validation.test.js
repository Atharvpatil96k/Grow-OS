'use strict';

process.env.GEMINI_API_KEY = 'test-key';
process.env.NODE_ENV = 'test';

// Mock redis before any require
jest.mock('ioredis', () => {
  const mockSet = jest.fn().mockResolvedValue('OK');
  const mockGet = jest.fn().mockResolvedValue(null);
  const mockDel = jest.fn().mockResolvedValue(1);
  const mockConnect = jest.fn().mockResolvedValue(undefined);
  const mockOn = jest.fn();
  const mockQuit = jest.fn().mockResolvedValue(undefined);

  return jest.fn(() => ({ set: mockSet, get: mockGet, del: mockDel, connect: mockConnect, on: mockOn, quit: mockQuit }));
});

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: jest.fn(() => ({ generateContent: jest.fn() })),
  })),
}));

const request = require('supertest');
const app = require('../server');

describe('Validation Middleware', () => {
  describe('POST /api/chat', () => {
    it('returns 400 when session_id is missing', async () => {
      const res = await request(app).post('/api/chat').send({ message: 'hello' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when session_id is empty string', async () => {
      const res = await request(app).post('/api/chat').send({ session_id: '', message: 'hello' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/regenerate', () => {
    it('returns 400 when section is invalid', async () => {
      const res = await request(app)
        .post('/api/regenerate')
        .send({ session_id: 'test-session', section: 'invalid_section' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when session_id is missing', async () => {
      const res = await request(app)
        .post('/api/regenerate')
        .send({ section: 'captions' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/publish', () => {
    it('returns 400 when platform is invalid', async () => {
      const res = await request(app)
        .post('/api/publish')
        .send({ session_id: 'test-session', platform: 'tiktok', caption: 'Hello!' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when caption is missing', async () => {
      const res = await request(app)
        .post('/api/publish')
        .send({ session_id: 'test-session', platform: 'twitter' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
    });
  });
});
