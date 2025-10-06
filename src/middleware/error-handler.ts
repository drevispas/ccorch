/**
 * Global Error Handler Middleware
 *
 * WBS Task: 7.5 Error Handling
 *
 * Maps error types to HTTP status codes and formats consistent error responses.
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/**
 * Global error handler middleware
 *
 * Handles different error types and returns appropriate HTTP responses:
 * - Zod validation errors → 400 with field details
 * - Not found errors → 404
 * - Auth errors → 401/403
 * - All other errors → 500 with logging
 *
 * @param err - Error object
 * @param req - Express request
 * @param res - Express response
 * @param next - Express next function
 */
export function errorHandler(
  err: Error | ZodError | any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    res.status(400).json({
      error: 'Validation error',
      details,
    });
    return;
  }

  // Handle standard Error objects
  if (err instanceof Error) {
    const message = err.message.toLowerCase();

    // Not found errors (404) - must start with these phrases or contain "not found" in specific pattern
    if (
      message.startsWith('workflow not found') ||
      message.startsWith('resource not found') ||
      message.includes('does not exist')
    ) {
      res.status(404).json({
        error: 'Not found',
        message: err.message,
      });
      return;
    }

    // Unauthorized errors (401)
    if (message.includes('unauthorized')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: err.message,
      });
      return;
    }

    // Forbidden errors (403)
    if (message.includes('forbidden')) {
      res.status(403).json({
        error: 'Forbidden',
        message: err.message,
      });
      return;
    }

    // Internal server errors (500) - log with stack trace
    console.error('Internal server error:', {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
    });

    res.status(500).json({
      error: 'Internal server error',
      message: err.message || 'An unexpected error occurred',
    });
    return;
  }

  // Handle non-Error objects
  console.error('Internal server error:', {
    error: err,
    url: req.url,
    method: req.method,
  });

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred',
  });
}
