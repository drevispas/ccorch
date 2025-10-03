import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Unit tests for Database Configuration
 *
 * Test Suite: Database Connection Lifecycle Management
 * Purpose: Validate singleton pattern and graceful shutdown
 * Key Features:
 * - Singleton pattern prevents connection leaks
 * - Graceful shutdown on SIGINT/SIGTERM
 * - Proper cleanup of database connections
 *
 * Following TDD approach - these tests will fail (red) until implementation is complete
 */

// Mock PrismaClient at module level (hoisted)
const mockDisconnect = vi.fn().mockResolvedValue(undefined);
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockPrismaClient = {
  $disconnect: mockDisconnect,
  $connect: mockConnect,
};

const MockPrismaClientConstructor = vi.fn(() => mockPrismaClient);

vi.mock('@prisma/client', () => ({
  PrismaClient: MockPrismaClientConstructor,
}));

describe('Database Configuration', () => {
  beforeEach(() => {
    // Reset modules to ensure clean state for singleton testing
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('getPrismaClient()', () => {
    it('should return a singleton PrismaClient instance', async () => {
      const { getPrismaClient } = await import('../../../src/config/database');

      const client1 = getPrismaClient();
      const client2 = getPrismaClient();

      expect(client1).toBe(client2);
      expect(client1).toBeDefined();
    });

    it('should only create one PrismaClient instance across multiple calls', async () => {
      const { getPrismaClient } = await import('../../../src/config/database');

      getPrismaClient();
      getPrismaClient();
      getPrismaClient();

      // PrismaClient constructor should only be called once
      expect(MockPrismaClientConstructor).toHaveBeenCalledTimes(1);
    });

    it('should initialize PrismaClient with correct datasource URL', async () => {
      vi.stubEnv('DATABASE_URL', 'file:./test.db');

      const { getPrismaClient } = await import('../../../src/config/database');

      getPrismaClient();

      expect(MockPrismaClientConstructor).toHaveBeenCalledWith({
        datasources: {
          db: {
            url: 'file:./test.db',
          },
        },
      });
    });

    it('should use DATABASE_URL from environment', async () => {
      const testUrl = 'file:./custom-test.db';
      vi.stubEnv('DATABASE_URL', testUrl);

      const { getPrismaClient } = await import('../../../src/config/database');

      getPrismaClient();

      expect(MockPrismaClientConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          datasources: {
            db: {
              url: testUrl,
            },
          },
        })
      );
    });
  });

  describe('disconnectDatabase()', () => {
    it('should disconnect from database', async () => {
      const { getPrismaClient, disconnectDatabase } = await import(
        '../../../src/config/database'
      );

      getPrismaClient();
      await disconnectDatabase();

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it('should handle disconnect when client not initialized', async () => {
      const { disconnectDatabase } = await import('../../../src/config/database');

      // Should not throw error
      await expect(disconnectDatabase()).resolves.toBeUndefined();
    });

    it('should handle disconnect errors gracefully', async () => {
      const disconnectError = new Error('Disconnect failed');
      mockPrismaClient.$disconnect.mockRejectedValue(disconnectError);

      const { getPrismaClient, disconnectDatabase } = await import(
        '../../../src/config/database'
      );

      getPrismaClient();

      // Should not throw, but log error
      await expect(disconnectDatabase()).resolves.toBeUndefined();
    });
  });

  describe('graceful shutdown', () => {
    it('should disconnect on SIGINT signal', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

      const { getPrismaClient } = await import('../../../src/config/database');

      getPrismaClient();

      // Simulate SIGINT
      process.emit('SIGINT');

      // Give async operations time to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockDisconnect).toHaveBeenCalled();

      mockExit.mockRestore();
    });

    it('should disconnect on SIGTERM signal', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

      const { getPrismaClient } = await import('../../../src/config/database');

      getPrismaClient();

      // Simulate SIGTERM
      process.emit('SIGTERM');

      // Give async operations time to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockDisconnect).toHaveBeenCalled();

      mockExit.mockRestore();
    });

    it('should exit process after graceful shutdown', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

      const { getPrismaClient } = await import('../../../src/config/database');

      getPrismaClient();

      // Simulate SIGINT
      process.emit('SIGINT');

      // Give async operations time to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockExit).toHaveBeenCalledWith(0);

      mockExit.mockRestore();
    });

    it('should log shutdown message on graceful shutdown', async () => {
      const mockLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

      const { getPrismaClient } = await import('../../../src/config/database');

      getPrismaClient();

      // Simulate SIGTERM
      process.emit('SIGTERM');

      // Give async operations time to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Gracefully shutting down')
      );

      mockLog.mockRestore();
      mockExit.mockRestore();
    });

    it('should only register shutdown handlers once', async () => {
      const { getPrismaClient } = await import('../../../src/config/database');

      const initialListenerCount = process.listenerCount('SIGINT');

      getPrismaClient();
      getPrismaClient();
      getPrismaClient();

      const finalListenerCount = process.listenerCount('SIGINT');

      // Should only add one listener despite multiple getPrismaClient calls
      expect(finalListenerCount).toBe(initialListenerCount + 1);
    });
  });

  describe('edge cases', () => {
    it('should handle missing DATABASE_URL with fallback', async () => {
      vi.stubEnv('DATABASE_URL', '');

      const { getPrismaClient } = await import('../../../src/config/database');

      getPrismaClient();

      // Should still create PrismaClient (with fallback or default)
      expect(MockPrismaClientConstructor).toHaveBeenCalled();
    });

    it('should prevent multiple simultaneous disconnects', async () => {
      const { getPrismaClient, disconnectDatabase } = await import(
        '../../../src/config/database'
      );

      getPrismaClient();

      // Trigger multiple disconnects simultaneously
      await Promise.all([
        disconnectDatabase(),
        disconnectDatabase(),
        disconnectDatabase(),
      ]);

      // Should only disconnect once
      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    it('should allow reconnection after disconnect', async () => {
      vi.resetModules();

      const { getPrismaClient, disconnectDatabase } = await import(
        '../../../src/config/database'
      );

      const client1 = getPrismaClient();
      await disconnectDatabase();

      // Reset module to simulate restart
      vi.resetModules();

      const { getPrismaClient: getPrismaClient2 } = await import(
        '../../../src/config/database'
      );

      const client2 = getPrismaClient2();

      // Should create new instance after disconnect
      expect(client2).toBeDefined();
    });
  });
});
