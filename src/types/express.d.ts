/**
 * Express type extensions
 * Augments Express Request type to include custom properties
 */

import { Request } from 'express';

declare module 'express' {
  interface Request {
    /**
     * Unique request ID added by express-request-id middleware
     */
    id?: string;
  }
}
