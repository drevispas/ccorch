/**
 * Performance Tests
 *
 * Purpose: Validate latency targets per PRD §8.1
 * Targets:
 * - Hook response time: <500ms
 * - API response time: <1s
 * - Concurrent workflows: 10 parallel without errors
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { startServer } from '../../src/server';
import type { Express } from 'express';

describe('Performance Tests', () => {
  let app: Express;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await startServer();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Hook Response Time (<500ms)', () => {
    it('should handle UserPromptSubmit hook in under 500ms', async () => {
      const startTime = Date.now();

      const response = await request(app)
        .post('/hooks/user-prompt-submit')
        .send({
          hookName: 'UserPromptSubmit',
          userPrompt: 'Implement REST API for user management',
          conversationId: `perf-test-${Date.now()}`,
          timestamp: Date.now()
        });

      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(500);

      console.log(`UserPromptSubmit hook latency: ${duration}ms`);
    });

    it('should handle PostToolUse hook in under 500ms', async () => {
      // First create a workflow
      const createResponse = await request(app)
        .post('/hooks/user-prompt-submit')
        .send({
          hookName: 'UserPromptSubmit',
          userPrompt: 'Build authentication system',
          conversationId: `perf-test-${Date.now()}`,
          timestamp: Date.now()
        });

      const workflowId = createResponse.body.workflowId;

      // Now test PostToolUse hook
      const startTime = Date.now();

      const response = await request(app)
        .post('/hooks/post-tool-use')
        .send({
          hookName: 'PostToolUse',
          workflowId,
          toolName: 'Task',
          conversationId: `perf-test-${Date.now()}`,
          timestamp: Date.now(),
          agentResults: {
            agentRole: 'backend-architect',
            complexity: 'moderate',
            stepNumber: 0,
            results: {
              summary: 'Performance test result'
            },
            status: 'COMPLETED'
          }
        });

      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(500);

      console.log(`PostToolUse hook latency: ${duration}ms`);
    });
  });

  describe('API Response Time (<1s)', () => {
    it('should return workflow status in under 1 second', async () => {
      // Create a workflow first
      const createResponse = await request(app)
        .post('/hooks/user-prompt-submit')
        .send({
          hookName: 'UserPromptSubmit',
          userPrompt: 'Create dashboard UI',
          conversationId: `perf-test-${Date.now()}`,
          timestamp: Date.now()
        });

      const workflowId = createResponse.body.workflowId;

      // Test status endpoint
      const startTime = Date.now();

      const response = await request(app).get(
        `/api/workflows/${workflowId}/status`
      );

      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(1000);

      console.log(`GET /status latency: ${duration}ms`);
    });

    it('should handle set-complexity in under 1 second', async () => {
      // Create a workflow first
      const createResponse = await request(app)
        .post('/hooks/user-prompt-submit')
        .send({
          hookName: 'UserPromptSubmit',
          userPrompt: 'Implement payment processing',
          conversationId: `perf-test-${Date.now()}`,
          timestamp: Date.now()
        });

      const workflowId = createResponse.body.workflowId;

      // Test set-complexity endpoint
      const startTime = Date.now();

      const response = await request(app)
        .post(`/api/workflows/${workflowId}/set-complexity`)
        .send({
          complexity: 'complex'
        });

      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(1000);

      console.log(`POST /set-complexity latency: ${duration}ms`);
    });

    it('should handle result submission in under 1 second', async () => {
      // Create a workflow first
      const createResponse = await request(app)
        .post('/hooks/user-prompt-submit')
        .send({
          hookName: 'UserPromptSubmit',
          userPrompt: 'Build notification service',
          conversationId: `perf-test-${Date.now()}`,
          timestamp: Date.now()
        });

      const workflowId = createResponse.body.workflowId;

      // Set complexity first
      await request(app)
        .post(`/api/workflows/${workflowId}/set-complexity`)
        .send({ complexity: 'moderate' });

      // Test result submission endpoint
      const startTime = Date.now();

      const response = await request(app)
        .post(`/api/workflows/${workflowId}/results`)
        .send({
          agentRole: 'backend-architect',
          complexity: 'moderate',
          stepNumber: 0,
          results: {
            summary: 'Performance test result',
            design: 'System architecture completed'
          },
          status: 'COMPLETED'
        });

      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(1000);

      console.log(`POST /results latency: ${duration}ms`);
    });
  });

  describe('Concurrent Workflows', () => {
    it('should handle 10 parallel workflow creations without errors', async () => {
      const startTime = Date.now();

      // Create 10 workflows concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post('/hooks/user-prompt-submit')
          .send({
            hookName: 'UserPromptSubmit',
            userPrompt: `Concurrent test workflow ${i + 1}`,
            conversationId: `concurrent-test-${Date.now()}-${i}`,
            timestamp: Date.now()
          })
      );

      const responses = await Promise.all(promises);

      const duration = Date.now() - startTime;

      // Verify all succeeded
      responses.forEach((response, i) => {
        expect(response.status).toBe(200);
        expect(response.body.workflowId).toBeDefined();
      });

      console.log(
        `10 concurrent workflow creations completed in ${duration}ms (avg: ${Math.round(duration / 10)}ms per workflow)`
      );

      // Average should be reasonable
      expect(duration / 10).toBeLessThan(1000);
    });

    it('should handle 10 parallel agent result submissions without errors', async () => {
      // First create 10 workflows
      const createPromises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post('/hooks/user-prompt-submit')
          .send({
            hookName: 'UserPromptSubmit',
            userPrompt: `Parallel result test ${i + 1}`,
            conversationId: `parallel-result-${Date.now()}-${i}`,
            timestamp: Date.now()
          })
      );

      const createResponses = await Promise.all(createPromises);
      const workflowIds = createResponses.map((r) => r.body.workflowId);

      // Set complexity for all
      await Promise.all(
        workflowIds.map((id) =>
          request(app)
            .post(`/api/workflows/${id}/set-complexity`)
            .send({ complexity: 'simple' })
        )
      );

      // Now submit results in parallel
      const startTime = Date.now();

      const resultPromises = workflowIds.map((workflowId) =>
        request(app)
          .post(`/api/workflows/${workflowId}/results`)
          .send({
            agentRole: 'backend-architect',
            complexity: 'simple',
            stepNumber: 0,
            results: {
              summary: 'Parallel test result'
            },
            status: 'COMPLETED'
          })
      );

      const responses = await Promise.all(resultPromises);

      const duration = Date.now() - startTime;

      // Verify all succeeded
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      console.log(
        `10 parallel result submissions completed in ${duration}ms (avg: ${Math.round(duration / 10)}ms per submission)`
      );

      // Average should be reasonable
      expect(duration / 10).toBeLessThan(1000);
    });
  });

  describe('Health Check Performance', () => {
    it('should respond to health checks in under 100ms', async () => {
      const startTime = Date.now();

      const response = await request(app).get('/health');

      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(100);

      console.log(`Health check latency: ${duration}ms`);
    });
  });

  describe('Database Query Performance', () => {
    it('should query recent workflows efficiently', async () => {
      // Create several workflows first
      const createPromises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/hooks/user-prompt-submit')
          .send({
            hookName: 'UserPromptSubmit',
            userPrompt: `DB query test ${i + 1}`,
            conversationId: `db-query-${Date.now()}-${i}`,
            timestamp: Date.now()
          })
      );

      await Promise.all(createPromises);

      // Query database
      const startTime = Date.now();

      const workflows = await prisma.workflow.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
      });

      const duration = Date.now() - startTime;

      expect(workflows.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50);

      console.log(`Database query (10 recent workflows) latency: ${duration}ms`);
    });
  });
});
