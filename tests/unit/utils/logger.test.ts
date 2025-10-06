import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { logger, rawLogger } from '../../../src/utils/logger';
import pino from 'pino';

describe('Logger', () => {
  let logSpy: any;
  let output: string[] = [];

  beforeEach(() => {
    // Capture pino output by mocking the destination stream
    output = [];
    // Mock pino's write method to capture output
    logSpy = vi.spyOn(rawLogger, 'info' as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Structured Logging', () => {
    it('should log with context object and message', () => {
      logger.info({ userId: '123', action: 'login' }, 'User logged in');

      expect(logSpy).toHaveBeenCalledWith(
        { userId: '123', action: 'login' },
        'User logged in'
      );
    });

    it('should log string message only', () => {
      logger.info('Simple message');

      expect(logSpy).toHaveBeenCalledWith('Simple message');
    });
  });

  describe('Request ID Context', () => {
    it('should include request ID in log context when provided', () => {
      logger.info({ requestId: 'req-12345' }, 'Processing request');

      expect(logSpy).toHaveBeenCalledWith(
        { requestId: 'req-12345' },
        'Processing request'
      );
    });
  });

  describe('Workflow ID Context', () => {
    it('should include workflow ID in log context when provided', () => {
      logger.info(
        { workflowId: 'wf-abc-123', step: 2 },
        'Agent execution started'
      );

      expect(logSpy).toHaveBeenCalledWith(
        { workflowId: 'wf-abc-123', step: 2 },
        'Agent execution started'
      );
    });
  });

  describe('Log Levels', () => {
    it('should support debug level', () => {
      const debugSpy = vi.spyOn(rawLogger, 'debug' as any);
      logger.debug('Debug message');

      expect(debugSpy).toHaveBeenCalledWith('Debug message');
      debugSpy.mockRestore();
    });

    it('should support info level', () => {
      logger.info('Info message');

      expect(logSpy).toHaveBeenCalledWith('Info message');
    });

    it('should support warn level', () => {
      const warnSpy = vi.spyOn(rawLogger, 'warn' as any);
      logger.warn('Warning message');

      expect(warnSpy).toHaveBeenCalledWith('Warning message');
      warnSpy.mockRestore();
    });

    it('should support error level', () => {
      const errorSpy = vi.spyOn(rawLogger, 'error' as any);
      logger.error('Error message');

      expect(errorSpy).toHaveBeenCalledWith('Error message');
      errorSpy.mockRestore();
    });
  });

  describe('Message Formats', () => {
    it('should handle string message only', () => {
      logger.info('Simple message');

      expect(logSpy).toHaveBeenCalledWith('Simple message');
    });

    it('should handle context object with message', () => {
      logger.info({ key: 'value' }, 'Message with context');

      expect(logSpy).toHaveBeenCalledWith(
        { key: 'value' },
        'Message with context'
      );
    });

    it('should handle complex nested context', () => {
      const context = {
        user: { id: '123', name: 'Test' },
        metadata: { timestamp: Date.now() }
      };

      logger.info(context, 'Complex context');

      expect(logSpy).toHaveBeenCalledWith(context, 'Complex context');
    });
  });

  describe('Error Object Logging', () => {
    it('should properly pass Error objects to pino', () => {
      const errorSpy = vi.spyOn(rawLogger, 'error' as any);
      const error = new Error('Test error');

      logger.error({ err: error }, 'Error occurred');

      expect(errorSpy).toHaveBeenCalledWith(
        { err: error },
        'Error occurred'
      );

      errorSpy.mockRestore();
    });
  });

  describe('Logger Configuration', () => {
    it('should use pino logger under the hood', () => {
      expect(rawLogger).toBeDefined();
      expect(typeof rawLogger.info).toBe('function');
      expect(typeof rawLogger.error).toBe('function');
      expect(typeof rawLogger.warn).toBe('function');
      expect(typeof rawLogger.debug).toBe('function');
    });
  });
});
