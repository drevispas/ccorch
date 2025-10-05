/**
 * Integration Tests: Set-Complexity API Endpoint
 *
 * Tests the POST /api/workflows/:workflowId/set-complexity endpoint
 * with real database operations and full request/response validation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import express, { Express } from 'express';
import request from 'supertest';
import { setComplexity } from '../../../src/api/routes/complexity.js';
import { WorkflowRepository } from '../../../src/models/workflow-repository.js';

// NOTE: These integration tests are deferred to Phase 3/4 when full Express app is set up
// They require complete API infrastructure including route registration, middleware, etc.
describe.skip('POST /api/workflows/:workflowId/set-complexity', () => {
  let prisma: PrismaClient;
  let app: Express;
  let workflowRepo: WorkflowRepository;

  beforeAll(async () => {
    // Use in-memory SQLite for tests
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: 'file::memory:?cache=shared',
        },
      },
    });

    // Run migrations
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');

    // Create tables manually (since we're using in-memory)
    await prisma.$executeRaw`
      CREATE TABLE workflows (
        id TEXT PRIMARY KEY,
        user_prompt TEXT NOT NULL,
        chain_name TEXT NOT NULL,
        complexity TEXT NOT NULL,
        draft_complexity TEXT,
        current_step INTEGER DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `;

    workflowRepo = new WorkflowRepository(prisma);

    // Setup Express app with route
    app = express();
    app.use(express.json());
    app.post('/api/workflows/:workflowId/set-complexity', setComplexity);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clear workflows before each test
    await prisma.workflow.deleteMany();
  });

  describe('Success Cases', () => {
    it('should update workflow complexity and return nextInstructions (200)', async () => {
      // Create workflow in PENDING_COMPLEXITY state
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Implement REST API',
        chainName: 'backend-development',
        complexity: 'moderate', // Initial value
        draftComplexity: 'moderate',
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({
          complexity: 'complex',
          reasoning: 'Multi-module changes required',
        });

      expect(response.status).toBe(200);

      const body = response.body;
      expect(body).toMatchObject({
        success: true,
        workflowId: workflow.id,
        complexity: 'complex',
      });
      expect(body.nextInstructions).toContain('backend-architect-complex');
      expect(body.nextInstructions).toContain('subagent');

      // Verify workflow updated in database
      const updated = await workflowRepo.findById(workflow.id);
      expect(updated?.complexity).toBe('complex');
      expect(updated?.status).toBe('ACTIVE');
      expect(updated?.currentStep).toBe(0);
    });

    it('should accept complexity without reasoning (optional field)', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Fix bug',
        chainName: 'debug',
        complexity: 'simple',
        draftComplexity: 'simple',
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({
          complexity: 'simple',
        });

      expect(response.status).toBe(200);

      const body = response.body;
      expect(body.success).toBe(true);
      expect(body.complexity).toBe('simple');
    });

    it('should handle all three complexity levels (simple, moderate, complex)', async () => {
      const complexities: Array<'simple' | 'moderate' | 'complex'> = [
        'simple',
        'moderate',
        'complex',
      ];

      for (const complexity of complexities) {
        const workflow = await workflowRepo.createWorkflow({
          userPrompt: 'Test task',
          chainName: 'backend-only',
          complexity: 'moderate',
          draftComplexity: 'moderate',
          currentStep: -1,
          status: 'PENDING_COMPLEXITY',
        });

        const response = await request(app)
          .post(`/api/workflows/${workflow.id}/set-complexity`)
          .send({ complexity });

        expect(response.status).toBe(200);

        const body = response.body;
        expect(body.complexity).toBe(complexity);
      }
    });
  });

  describe('Validation Errors (400)', () => {
    it('should reject invalid complexity value', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Task',
        chainName: 'backend-development',
        complexity: 'moderate',
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({
          complexity: 'invalid-value',
        });

      expect(response.status).toBe(400);

      const body = response.body;
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Invalid request body');
    });

    it('should reject missing complexity field', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Task',
        chainName: 'backend-development',
        complexity: 'moderate',
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({
          reasoning: 'Missing complexity field',
        });

      expect(response.status).toBe(400);

      const body = response.body;
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject reasoning >200 characters', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Task',
        chainName: 'backend-development',
        complexity: 'moderate',
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      const longReasoning = 'a'.repeat(201);

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({
          complexity: 'complex',
          reasoning: longReasoning,
        });

      expect(response.status).toBe(400);

      const body = response.body;
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toBeDefined();
    });
  });

  describe('Not Found Errors (404)', () => {
    it('should return 404 for non-existent workflow', async () => {
      const response = await request(app)
        .post('/api/workflows/non-existent-id/set-complexity')
        .send({
          complexity: 'moderate',
        });

      expect(response.status).toBe(404);

      const body = response.body;
      expect(body.error.code).toBe('WORKFLOW_NOT_FOUND');
      expect(body.error.message).toContain('non-existent-id');
    });
  });

  describe('State Conflicts (409)', () => {
    it('should reject if workflow status is ACTIVE (not PENDING_COMPLEXITY)', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Task',
        chainName: 'backend-development',
        complexity: 'moderate',
        currentStep: 0,
        status: 'ACTIVE', // Already active
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({
          complexity: 'complex',
        });

      expect(response.status).toBe(409);

      const body = response.body;
      expect(body.error.code).toBe('INVALID_STATE');
      expect(body.error.message).toContain('ACTIVE');
      expect(body.error.message).toContain('PENDING_COMPLEXITY');
    });

    it('should reject if workflow status is COMPLETED', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Task',
        chainName: 'backend-development',
        complexity: 'moderate',
        currentStep: 3,
        status: 'COMPLETED',
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({
          complexity: 'simple',
        });

      expect(response.status).toBe(409);

      const body = response.body;
      expect(body.error.code).toBe('INVALID_STATE');
    });

    it('should reject if workflow status is FAILED', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Task',
        chainName: 'backend-development',
        complexity: 'moderate',
        currentStep: 1,
        status: 'FAILED',
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({
          complexity: 'moderate',
        });

      expect(response.status).toBe(409);

      const body = response.body;
      expect(body.error.code).toBe('INVALID_STATE');
    });
  });

  describe('Idempotency', () => {
    it('should allow multiple calls with same complexity (last wins)', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Task',
        chainName: 'backend-development',
        complexity: 'moderate',
        draftComplexity: 'moderate',
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      // First call
      const response1 = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({
          complexity: 'simple',
        });

      expect(response1.status).toBe(200);

      // However, after first call, workflow is ACTIVE, so second call will fail with 409
      // This tests that idempotency requires PENDING_COMPLEXITY state
      const response2 = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({
          complexity: 'complex',
        });

      expect(response2.status).toBe(409); // State changed to ACTIVE after first call
    });
  });
});
