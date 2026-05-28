'use strict';

// Mock the GoogleGenerativeAI before importing the service
jest.mock('@google/generative-ai', () => {
  const mockGenerateContent = jest.fn();
  const mockGetGenerativeModel = jest.fn(() => ({ generateContent: mockGenerateContent }));
  return {
    GoogleGenerativeAI: jest.fn(() => ({ getGenerativeModel: mockGetGenerativeModel })),
    _mockGenerateContent: mockGenerateContent,
  };
});

// Set up env before requiring modules
process.env.GEMINI_API_KEY = 'test-key';

const { _mockGenerateContent } = require('@google/generative-ai');
const { callGemini, callGeminiJSON } = require('../services/gemini');

describe('Gemini Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('callGemini()', () => {
    it('returns text from Gemini response', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => 'Hello World' },
      });

      const result = await callGemini('test prompt');
      expect(result).toBe('Hello World');
      expect(_mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and eventually throws', async () => {
      _mockGenerateContent.mockRejectedValue(new Error('API Error'));

      await expect(callGemini('test', 1)).rejects.toThrow('API Error');
      expect(_mockGenerateContent).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });
  });

  describe('callGeminiJSON()', () => {
    it('parses clean JSON response', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => '{"key":"value","num":42}' },
      });

      const result = await callGeminiJSON('test prompt');
      expect(result).toEqual({ key: 'value', num: 42 });
    });

    it('strips markdown code fences and parses JSON', async () => {
      const jsonContent = '{"brand_tone":["bold","modern"]}';
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => `\`\`\`json\n${jsonContent}\n\`\`\`` },
      });

      const result = await callGeminiJSON('test prompt');
      expect(result).toEqual({ brand_tone: ['bold', 'modern'] });
    });

    it('strips plain code fences and parses JSON', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => '```\n{"foo":"bar"}\n```' },
      });

      const result = await callGeminiJSON('test prompt');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('parses JSON array responses', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => '[{"day":"Monday"},{"day":"Tuesday"}]' },
      });

      const result = await callGeminiJSON('test prompt');
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].day).toBe('Monday');
    });

    it('throws when no JSON found in response', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => 'This is just plain text with no JSON' },
      });

      await expect(callGeminiJSON('test prompt')).rejects.toThrow('No JSON found');
    });
  });
});
