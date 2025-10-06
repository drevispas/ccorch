/**
 * Request ID Middleware
 *
 * Purpose: Generate unique ID for each HTTP request
 * Uses: express-request-id package
 * Attaches: Unique request ID to req.id
 */

// @ts-expect-error - express-request-id doesn't have proper type definitions
import requestId from 'express-request-id';

/**
 * Express middleware that adds unique request ID to each request
 * The ID is accessible via req.id
 */
export const requestIdMiddleware = requestId({
  // Use X-Request-Id header if present, otherwise generate new UUID
  setHeader: true,
  headerName: 'X-Request-Id',
  attributeName: 'id'
});
