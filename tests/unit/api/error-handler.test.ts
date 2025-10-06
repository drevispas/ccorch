/**
 * Error Handler Middleware Tests
 *
 * WBS Task: 7.5 Error Handling (TDD)
 *
 * Tests the global error handler middleware for consistent error responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';
import { errorHandler } from '../../../src/middleware/error-handler.js';

describe('errorHandler', () => {
  // Mock Express request/response/next
  const mockReq = {} as Request;
  let mockRes: Partial<Response>;
  const mockNext = vi.fn() as NextFunction;

  beforeEach(() => {
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
  });

  describe('Zod Validation Errors', () => {
    it('should return 400 for Zod validation errors with field details', () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.number().min(0),
      });

      let zodError: ZodError;
      try {
        schema.parse({ name: '', age: -1 });
      } catch (err) {
        zodError = err as ZodError;
      }

      errorHandler(zodError!, mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation error',
          details: expect.any(Array),
        })
      );

      const jsonCall = (mockRes.json as any).mock.calls[0][0];
      expect(jsonCall.details).toHaveLength(2);
      expect(jsonCall.details[0]).toMatchObject({
        field: 'name',
        message: expect.any(String),
      });
      expect(jsonCall.details[1]).toMatchObject({
        field: 'age',
        message: expect.any(String),
      });
    });

    it('should handle single Zod validation error', () => {
      const schema = z.object({
        email: z.string().email(),
      });

      let zodError: ZodError;
      try {
        schema.parse({ email: 'invalid' });
      } catch (err) {
        zodError = err as ZodError;
      }

      errorHandler(zodError!, mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      const jsonCall = (mockRes.json as any).mock.calls[0][0];
      expect(jsonCall.details).toHaveLength(1);
      expect(jsonCall.details[0].field).toBe('email');
    });
  });

  describe('Not Found Errors', () => {
    it('should return 404 for errors with "not found" message', () => {
      const error = new Error('Workflow not found');

      errorHandler(error, mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Not found',
        message: 'Workflow not found',
      });
    });

    it('should return 404 for errors with "does not exist" message', () => {
      const error = new Error('Resource does not exist');

      errorHandler(error, mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Not found',
        message: 'Resource does not exist',
      });
    });
  });

  describe('Authentication/Authorization Errors', () => {
    it('should return 401 for "unauthorized" errors', () => {
      const error = new Error('Unauthorized access');

      errorHandler(error, mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Unauthorized access',
      });
    });

    it('should return 403 for "forbidden" errors', () => {
      const error = new Error('Forbidden: insufficient permissions');

      errorHandler(error, mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Forbidden: insufficient permissions',
      });
    });
  });

  describe('Internal Server Errors', () => {
    it('should return 500 for generic errors', () => {
      const error = new Error('Something went wrong');

      errorHandler(error, mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Something went wrong',
      });
    });

    it('should return 500 for errors without message', () => {
      const error = new Error();

      errorHandler(error, mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred',
      });
    });

    it('should handle non-Error objects', () => {
      const error = { custom: 'error object' };

      errorHandler(error as any, mockReq, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'An unexpected error occurred',
      });
    });
  });

  describe('Error Logging', () => {
    it('should log 500 errors with stack trace', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Database connection failed');
      error.stack = 'Error: Database connection failed\n  at test.ts:123';

      errorHandler(error, mockReq, mockRes as Response, mockNext);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Internal server error:'),
        expect.objectContaining({
          message: 'Database connection failed',
          stack: expect.any(String),
        })
      );

      consoleSpy.mockRestore();
    });

    it('should not log 400 validation errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const schema = z.object({ name: z.string() });

      let zodError: ZodError;
      try {
        schema.parse({});
      } catch (err) {
        zodError = err as ZodError;
      }

      errorHandler(zodError!, mockReq, mockRes as Response, mockNext);

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should not log 404 errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Resource not found');

      errorHandler(error, mockReq, mockRes as Response, mockNext);

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
