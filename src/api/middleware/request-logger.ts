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

  // Log incoming request
  logger.info(
    {
      requestId: req.id,
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip
    },
    'Incoming request'
  );

  // Capture original end function
  const originalEnd = res.end;

  // Override res.end to log response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.end = function (chunk?: any, encoding?: any, callback?: any): any {
    const duration = Date.now() - startTime;

    logger.info(
      {
        requestId: req.id,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`
      },
      'Request completed'
    );

    // Call original end function
    return originalEnd.call(this, chunk, encoding, callback);
  };

  next();
};
