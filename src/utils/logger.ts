/**
 * Logger Utility
 *
 * Purpose: Structured logging with pino
 * Features:
 * - JSON output in production, pretty-print in development
 * - Request ID and workflow ID context support
 * - Configurable log level via LOG_LEVEL env var
 */

import pino from 'pino';

interface LogContext {
  [key: string]: unknown;
}

/**
 * Create pino logger instance with environment-specific configuration
 */
const createLogger = () => {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const logLevel = process.env.LOG_LEVEL || 'info';

  return pino({
    level: logLevel,
    // Pretty print in development, JSON in production
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname'
          }
        }
      : undefined,
    // Serialize errors properly
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err
    }
  });
};

const pinoLogger = createLogger();

/**
 * Logger interface matching existing usage patterns
 * Supports both string messages and context objects
 */
export const logger = {
  info(contextOrMessage: LogContext | string, message?: string): void {
    if (typeof contextOrMessage === 'string') {
      pinoLogger.info(contextOrMessage);
    } else {
      pinoLogger.info(contextOrMessage, message);
    }
  },

  error(contextOrMessage: LogContext | string, message?: string): void {
    if (typeof contextOrMessage === 'string') {
      pinoLogger.error(contextOrMessage);
    } else {
      pinoLogger.error(contextOrMessage, message);
    }
  },

  warn(contextOrMessage: LogContext | string, message?: string): void {
    if (typeof contextOrMessage === 'string') {
      pinoLogger.warn(contextOrMessage);
    } else {
      pinoLogger.warn(contextOrMessage, message);
    }
  },

  debug(contextOrMessage: LogContext | string, message?: string): void {
    if (typeof contextOrMessage === 'string') {
      pinoLogger.debug(contextOrMessage);
    } else {
      pinoLogger.debug(contextOrMessage, message);
    }
  }
};

/**
 * Export raw pino logger for advanced use cases
 */
export const rawLogger = pinoLogger;
