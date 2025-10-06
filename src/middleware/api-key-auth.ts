/**
 * API Key Authentication Middleware
 *
 * WBS Task: 7.4 API Key Auth Middleware
 * PRD Reference: §5.4.4 (Admin authentication)
 *
 * Validates admin API key for protected endpoints.
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Require API key authentication
 *
 * Validates Authorization: Bearer <key> header against API_KEY_ADMIN env var
 *
 * @param req - Express request
 * @param res - Express response
 * @param next - Express next function
 * @returns 401 if missing, 403 if invalid, otherwise calls next()
 */
export function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Check if API key is configured (use process.env directly for test flexibility)
  const apiKey = process.env.API_KEY_ADMIN;
  if (!apiKey) {
    res.status(500).json({
      error: 'Server misconfiguration',
      message: 'API key authentication not configured',
    });
    return;
  }

  // Extract Authorization header
  const authHeader = req.headers.authorization;

  // Check if header present
  if (!authHeader) {
    res.status(401).json({
      error: 'API key required',
      message: 'Missing Authorization header',
    });
    return;
  }

  // Parse Bearer token
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      error: 'API key required',
      message: 'Invalid Authorization header format. Expected: Bearer <key>',
    });
    return;
  }

  const providedKey = parts[1];

  // Validate key
  if (providedKey !== apiKey) {
    res.status(403).json({
      error: 'Invalid API key',
      message: 'Provided API key is not authorized',
    });
    return;
  }

  // Key valid, proceed
  next();
}
