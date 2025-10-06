/**
 * Hook Authentication Middleware
 *
 * WBS Task: 6.3 Hook Authentication Integration Tests
 * Implements shared secret authentication for Claude Code hook endpoints
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Authentication middleware for hook endpoints
 *
 * Validates X-Hook-Secret header against HOOK_SECRET environment variable.
 * If HOOK_SECRET is not set, authentication is disabled (dev mode).
 *
 * Note: Reads from process.env directly (not cached env module) to allow
 * runtime configuration in tests.
 *
 * @returns Express middleware function
 */
export function authenticateHook(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If HOOK_SECRET is not configured, allow all requests (dev mode)
  const expectedSecret = process.env.HOOK_SECRET;

  if (!expectedSecret) {
    next();
    return;
  }

  // Get X-Hook-Secret header
  const providedSecret = req.get('X-Hook-Secret');

  // Missing header (undefined means header wasn't provided)
  if (providedSecret === undefined) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing X-Hook-Secret header',
    });
    return;
  }

  // Invalid secret (empty string or wrong value)
  if (providedSecret !== expectedSecret) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid X-Hook-Secret',
    });
    return;
  }

  // Valid authentication
  next();
}
