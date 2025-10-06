/**
 * Logger Utility
 *
 * Purpose: Simple logging wrapper (stub for now, will be expanded with pino in Phase 5)
 * TODO: Implement full structured logging with pino in Phase 5 (Observability)
 */

interface LogContext {
  [key: string]: unknown;
}

/**
 * Simple logger implementation
 * TODO: Replace with pino logger in Phase 5
 */
export const logger = {
  info(contextOrMessage: LogContext | string, message?: string): void {
    if (typeof contextOrMessage === 'string') {
      console.log(`[INFO] ${contextOrMessage}`);
    } else {
      console.log(`[INFO] ${message}`, JSON.stringify(contextOrMessage));
    }
  },

  error(contextOrMessage: LogContext | string, message?: string): void {
    if (typeof contextOrMessage === 'string') {
      console.error(`[ERROR] ${contextOrMessage}`);
    } else {
      console.error(`[ERROR] ${message}`, JSON.stringify(contextOrMessage));
    }
  },

  warn(contextOrMessage: LogContext | string, message?: string): void {
    if (typeof contextOrMessage === 'string') {
      console.warn(`[WARN] ${contextOrMessage}`);
    } else {
      console.warn(`[WARN] ${message}`, JSON.stringify(contextOrMessage));
    }
  },

  debug(contextOrMessage: LogContext | string, message?: string): void {
    if (typeof contextOrMessage === 'string') {
      console.debug(`[DEBUG] ${contextOrMessage}`);
    } else {
      console.debug(`[DEBUG] ${message}`, JSON.stringify(contextOrMessage));
    }
  },
};
