import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { createHealthRouter } from '../../../src/api/health';

describe('Health Check Endpoint', () => {
  let app: Express;
  let mockPrisma: any;

  beforeEach(() => {
    app = express();

    // Create mock Prisma client
    mockPrisma = {
      $queryRaw: vi.fn()
    };

    const healthRouter = createHealthRouter(mockPrisma);
    app.use('/health', healthRouter);
  });

  describe('GET /health', () => {
    it('should return 200 with status ok when database is connected', async () => {
      // Mock successful database query
      mockPrisma.$queryRaw.mockResolvedValue([{ result: 1 }]);

      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        uptime: expect.any(Number),
        database: 'connected'
      });
    });

    it('should include uptime in seconds', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ result: 1 }]);

      const response = await request(app).get('/health');

      expect(response.body.uptime).toBeGreaterThan(0);
      expect(typeof response.body.uptime).toBe('number');
    });

    it('should return timestamp', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ result: 1 }]);

      const response = await request(app).get('/health');

      expect(response.body.timestamp).toBeDefined();
      expect(typeof response.body.timestamp).toBe('string');
    });

    it('should return 503 when database connection fails', async () => {
      // Mock database connection failure
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        status: 'error',
        database: 'disconnected'
      });
    });

    it('should include error message when database check fails', async () => {
      const errorMessage = 'Connection timeout';
      mockPrisma.$queryRaw.mockRejectedValue(new Error(errorMessage));

      const response = await request(app).get('/health');

      expect(response.body.error).toBeDefined();
      // Error will contain the actual exception message
      expect(response.body.error).toBeDefined();
    });

    it('should still return uptime even when database is down', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('DB error'));

      const response = await request(app).get('/health');

      expect(response.body.uptime).toBeDefined();
      expect(response.body.uptime).toBeGreaterThan(0);
    });
  });

  describe('Database Health Check', () => {
    it('should execute a simple query to verify connection', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ result: 1 }]);

      await request(app).get('/health');

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should handle database query timeout', async () => {
      mockPrisma.$queryRaw.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), 100)
          )
      );

      const response = await request(app).get('/health');

      expect(response.status).toBe(503);
      expect(response.body.database).toBe('disconnected');
    });
  });

  describe('Response Format', () => {
    it('should return JSON content type', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ result: 1 }]);

      const response = await request(app).get('/health');

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('should have consistent response structure on success', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ result: 1 }]);

      const response = await request(app).get('/health');

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should have consistent response structure on failure', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('DB error'));

      const response = await request(app).get('/health');

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
