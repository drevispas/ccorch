/**
 * Dummy Echo API Endpoint
 *
 * Purpose: Simple echo endpoint for testing and validation
 * Returns: Echoed message with metadata and incrementing counter
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

// Zod validation schema for request body
const EchoRequestSchema = z.object({
  message: z.string().min(1).max(500),
  metadata: z.record(z.string(), z.unknown()).optional()
});

// TypeScript interfaces
interface EchoResponse {
  success: boolean;
  data: {
    echoed: string;
    metadata?: Record<string, unknown>;
    timestamp: string;
    requestId: string;
    echoCount: number;
  };
}

interface ErrorResponse {
  success: boolean;
  error: {
    message: string;
    details?: unknown;
  };
}

/**
 * Create dummy echo router
 */
export function createDummyRouter(): Router {
  const router = Router();
  let echoCount = 0;

  /**
   * POST /echo
   * Echoes back the provided message with metadata
   */
  router.post('/echo', (req: Request, res: Response) => {
    try {
      // Validate request body using Zod
      const validationResult = EchoRequestSchema.safeParse(req.body);

      if (!validationResult.success) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: {
            message: 'Validation failed',
            details: validationResult.error.issues
          }
        };

        logger.debug(
          { validationErrors: validationResult.error.issues },
          'Echo request validation failed'
        );

        return res.status(400).json(errorResponse);
      }

      // Extract validated data
      const { message, metadata } = validationResult.data;

      // Increment counter
      echoCount++;

      // Generate request ID
      const requestId = crypto.randomUUID();

      // Generate timestamp
      const timestamp = new Date().toISOString();

      // Build response
      const response: EchoResponse = {
        success: true,
        data: {
          echoed: message,
          ...(metadata && { metadata }),
          timestamp,
          requestId,
          echoCount
        }
      };

      logger.debug(
        {
          requestId,
          messageLength: message.length,
          echoCount,
          hasMetadata: !!metadata
        },
        'Echo request processed successfully'
      );

      return res.status(200).json(response);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      const errorResponse: ErrorResponse = {
        success: false,
        error: {
          message: errorMessage
        }
      };

      logger.error({ err: error }, 'Echo request failed with error');

      return res.status(500).json(errorResponse);
    }
  });

  return router;
}
