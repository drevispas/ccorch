/**
 * Request Logging Middleware
 *
 * Purpose: Log all HTTP requests and responses with timing
 * Logs: Method, path, request ID, status code, response time
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

/**
 * Middleware that logs incoming requests and outgoing responses
 * Includes request method, path, request ID, status code, and duration
 */
export const requestLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();

  // Log incoming request (concise - only essential fields)
  logger.info(
    {
      requestId: req.id,
      method: req.method,
      path: req.path,
    },
    'Incoming request'
  );

  // Capture original end function
  const originalEnd = res.end;

  // Override res.end to log response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.end = function (chunk?: any, encoding?: any, callback?: any): any {
    const duration = Date.now() - startTime;

    // Include workflowId if available (set by hook handlers for tracing)
    const logData: Record<string, any> = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    };

    // Add workflowId if present (distributed tracing)
    if ((req as any).workflowId) {
      logData.workflowId = (req as any).workflowId;
    }

    logger.info(logData, 'Request completed');

    // Call original end function
    return originalEnd.call(this, chunk, encoding, callback);
  };

  next();
};
