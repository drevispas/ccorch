/**
 * Database Connection Manager
 *
 * Purpose: Provides singleton PrismaClient instance for the application
 * Features:
 * - Singleton pattern prevents connection exhaustion
 * - Graceful shutdown on SIGINT/SIGTERM signals
 * - Connection cleanup on process termination
 * - Thread-safe disconnect handling
 */

import { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | null = null;
let isDisconnecting = false;
let shutdownHandlersRegistered = false;

/**
 * Get singleton PrismaClient instance
 * Initializes client on first call, returns same instance on subsequent calls
 */
export function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';

    prismaClient = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    // Register graceful shutdown handlers (only once)
    if (!shutdownHandlersRegistered) {
      registerShutdownHandlers();
      shutdownHandlersRegistered = true;
    }
  }

  return prismaClient;
}

/**
 * Disconnect from database
 * Handles cleanup and prevents multiple simultaneous disconnects
 */
export async function disconnectDatabase(): Promise<void> {
  if (!prismaClient || isDisconnecting) {
    return;
  }

  isDisconnecting = true;

  try {
    await prismaClient.$disconnect();
  } catch (error) {
    // Log error but don't throw - graceful degradation
    console.error('Error disconnecting from database:', error);
  } finally {
    prismaClient = null;
    isDisconnecting = false;
  }
}

/**
 * Register graceful shutdown handlers for process signals
 * Ensures database connections are properly closed on termination
 */
function registerShutdownHandlers(): void {
  const handleShutdown = async (signal: string) => {
    console.log(`Gracefully shutting down on ${signal}...`);
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}
