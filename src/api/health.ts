/**
 * Health Check Endpoint
 *
 * Purpose: Provide basic health status for monitoring and load balancers
 * Returns: Application uptime and database connection status
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

interface HealthResponse {
  status: 'ok' | 'error';
  uptime: number;
  database: 'connected' | 'disconnected';
  timestamp: string;
  error?: string;
}

/**
 * Check database connection by executing a simple query
 */
async function checkDatabaseConnection(
  prisma: PrismaClient
): Promise<boolean> {
  try {
    // Execute a simple query to verify connection
    // Use $queryRaw with SELECT 1 as a lightweight health check
    await prisma.$queryRaw`SELECT 1 as result`;
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Database health check failed');
    return false;
  }
}

/**
 * Create health check router
 */
export function createHealthRouter(prisma: PrismaClient): Router {
  const router = Router();

  /**
   * GET /health
   * Returns application health status
   */
  router.get('/', async (req: Request, res: Response) => {
    const uptime = process.uptime();
    const timestamp = new Date().toISOString();

    try {
      const isDatabaseConnected = await checkDatabaseConnection(prisma);

      if (isDatabaseConnected) {
        const response: HealthResponse = {
          status: 'ok',
          uptime,
          database: 'connected',
          timestamp
        };

        logger.debug({ uptime, database: 'connected' }, 'Health check passed');
        return res.status(200).json(response);
      } else {
        const response: HealthResponse = {
          status: 'error',
          uptime,
          database: 'disconnected',
          timestamp,
          error: 'Database connection check failed'
        };

        logger.warn(
          { uptime, database: 'disconnected' },
          'Health check failed: database disconnected'
        );
        return res.status(503).json(response);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      const response: HealthResponse = {
        status: 'error',
        uptime,
        database: 'disconnected',
        timestamp,
        error: errorMessage
      };

      logger.error({ err: error, uptime }, 'Health check failed with error');
      return res.status(503).json(response);
    }
  });

  return router;
}
