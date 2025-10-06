/**
 * POST /api/workflows/:id/transition Integration Tests
 *
 * WBS Task: 7.4 POST /api/workflows/:id/transition (TDD)
 * PRD Reference: §5.4.4
 *
 * Tests the admin transition endpoint for manual workflow control.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { startServer } from '../../../src/server.js';
import type { Express } from 'express';
import { ChainName, Complexity, AgentRole, WorkflowStatus } from '../../../src/types/workflow.js';
import { WorkflowRepository } from '../../../src/models/workflow-repository.js';

describe('POST /api/workflows/:id/transition', () => {
  let app: Express;
  let prisma: PrismaClient;
  let workflowRepo: WorkflowRepository;
  const ADMIN_API_KEY = 'test-admin-key-12345';

  beforeEach(async () => {
    prisma = new PrismaClient();
    workflowRepo = new WorkflowRepository(prisma);

    // Clean database before each test
    await prisma.agentResult.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflow.deleteMany();

    // Set API key for tests
    process.env.API_KEY_ADMIN = ADMIN_API_KEY;

    app = await startServer();
  });

  afterEach(async () => {
    await prisma.$disconnect();
    delete process.env.API_KEY_ADMIN;
  });

  describe('Authentication', () => {
    it('should return 401 when API key is missing', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Test workflow',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: Complexity.MODERATE,
        currentStep: 0,
        status: WorkflowStatus.ACTIVE,
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/transition`)
        .send({
          action: 'advance',
          reason: 'Test advance',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('API key required');
    });

    it('should return 403 when API key is invalid', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Test workflow',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: Complexity.MODERATE,
        currentStep: 0,
        status: WorkflowStatus.ACTIVE,
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/transition`)
        .set('Authorization', 'Bearer invalid-key')
        .send({
          action: 'advance',
          reason: 'Test advance',
        })
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid API key');
    });

    it('should accept valid API key with Bearer scheme', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Test workflow',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: Complexity.MODERATE,
        currentStep: 0,
        status: WorkflowStatus.ACTIVE,
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/transition`)
        .set('Authorization', `Bearer ${ADMIN_API_KEY}`)
        .send({
          action: 'advance',
          reason: 'Test advance',
        });

      // Should not be auth error (401/403)
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });

  describe('Validation', () => {
    it('should return 400 for invalid action', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Test workflow',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: Complexity.MODERATE,
        currentStep: 0,
        status: WorkflowStatus.ACTIVE,
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/transition`)
        .set('Authorization', `Bearer ${ADMIN_API_KEY}`)
        .send({
          action: 'invalid-action',
          reason: 'Test',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      // Just verify error message exists and mentions valid options
      expect(response.body.error).toContain('advance');
    });

    it('should return 400 for missing reason', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Test workflow',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: Complexity.MODERATE,
        currentStep: 0,
        status: WorkflowStatus.ACTIVE,
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/transition`)
        .set('Authorization', `Bearer ${ADMIN_API_KEY}`)
        .send({
          action: 'advance',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 for empty reason', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Test workflow',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: Complexity.MODERATE,
        currentStep: 0,
        status: WorkflowStatus.ACTIVE,
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/transition`)
        .set('Authorization', `Bearer ${ADMIN_API_KEY}`)
        .send({
          action: 'advance',
          reason: '',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 for non-existent workflow', async () => {
      const response = await request(app)
        .post('/api/workflows/00000000-0000-0000-0000-000000000000/transition')
        .set('Authorization', `Bearer ${ADMIN_API_KEY}`)
        .send({
          action: 'advance',
          reason: 'Test',
        })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Workflow not found');
    });
  });

  describe('Advance Action', () => {
    it('should advance workflow to next step', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Backend development',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: Complexity.MODERATE,
        currentStep: 0,
        status: WorkflowStatus.ACTIVE,
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/transition`)
        .set('Authorization', `Bearer ${ADMIN_API_KEY}`)
        .send({
          action: 'advance',
          reason: 'Manually advancing to next step',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        workflow_id: workflow.id,
        previous_step: 0,
        current_step: 1,
        status: 'ACTIVE',
      });
      expect(response.body).toHaveProperty('next_agent');
      expect(response.body).toHaveProperty('message');

      // Verify database updated
      const updated = await workflowRepo.findById(workflow.id);
      expect(updated?.currentStep).toBe(1);

      // Verify transition recorded
      const transitions = await prisma.workflowTransition.findMany({
        where: { workflowId: workflow.id },
      });
      expect(transitions).toHaveLength(1);
      expect(transitions[0].reason).toBe('Manually advancing to next step');
    });

    it('should complete workflow when advancing past final step', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Backend development',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: Complexity.MODERATE,
        currentStep: 2, // Last step for 3-step chain
        status: WorkflowStatus.ACTIVE,
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/transition`)
        .set('Authorization', `Bearer ${ADMIN_API_KEY}`)
        .send({
          action: 'advance',
          reason: 'Force completion',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        workflow_id: workflow.id,
        previous_step: 2,
        current_step: 3,
        status: 'COMPLETED',
        next_agent: null,
      });

      // Verify workflow marked as completed
      const updated = await workflowRepo.findById(workflow.id);
      expect(updated?.status).toBe('COMPLETED');
    });
  });

  describe('Fail Action', () => {
    it('should mark workflow as failed', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Backend development',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: Complexity.MODERATE,
        currentStep: 1,
        status: WorkflowStatus.ACTIVE,
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/transition`)
        .set('Authorization', `Bearer ${ADMIN_API_KEY}`)
        .send({
          action: 'fail',
          reason: 'Irrecoverable error detected',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        workflow_id: workflow.id,
        previous_step: 1,
        current_step: 1,
        status: 'FAILED',
        next_agent: null,
      });

      // Verify workflow marked as failed
      const updated = await workflowRepo.findById(workflow.id);
      expect(updated?.status).toBe('FAILED');
      expect(updated?.currentStep).toBe(1); // Step unchanged

      // Verify transition recorded
      const transitions = await prisma.workflowTransition.findMany({
        where: { workflowId: workflow.id },
      });
      expect(transitions).toHaveLength(1);
      expect(transitions[0].reason).toBe('Irrecoverable error detected');
    });
  });

  describe('Retry Action', () => {
    it('should clear last agent result and keep current step', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Backend development',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: Complexity.MODERATE,
        currentStep: 1,
        status: WorkflowStatus.ACTIVE,
      });

      // Create agent result for current step
      await prisma.agentResult.create({
        data: {
          workflowId: workflow.id,
          agentRole: AgentRole.BACKEND_DEVELOPER,
          complexity: Complexity.MODERATE,
          stepNumber: 1,
          results: JSON.stringify({ summary: 'Bad output' }),
          status: 'COMPLETED',
          createdAt: BigInt(Date.now()),
        },
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/transition`)
        .set('Authorization', `Bearer ${ADMIN_API_KEY}`)
        .send({
          action: 'retry',
          reason: 'Agent gave incorrect output, retrying',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        workflow_id: workflow.id,
        previous_step: 1,
        current_step: 1,
        status: 'ACTIVE',
      });
      expect(response.body.next_agent).toContain('backend-developer');

      // Verify current step unchanged
      const updated = await workflowRepo.findById(workflow.id);
      expect(updated?.currentStep).toBe(1);

      // Verify last agent result deleted
      const results = await prisma.agentResult.findMany({
        where: { workflowId: workflow.id, stepNumber: 1 },
      });
      expect(results).toHaveLength(0);
    });
  });

  describe('Skip Action', () => {
    it('should increment step and mark as skipped', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Backend development',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: Complexity.MODERATE,
        currentStep: 0,
        status: WorkflowStatus.ACTIVE,
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/transition`)
        .set('Authorization', `Bearer ${ADMIN_API_KEY}`)
        .send({
          action: 'skip',
          reason: 'Skipping slow architect step for testing',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        workflow_id: workflow.id,
        previous_step: 0,
        current_step: 1,
        status: 'ACTIVE',
      });
      expect(response.body.next_agent).toContain('backend-developer');

      // Verify step incremented
      const updated = await workflowRepo.findById(workflow.id);
      expect(updated?.currentStep).toBe(1);

      // Verify SKIPPED result created
      const results = await prisma.agentResult.findMany({
        where: { workflowId: workflow.id, stepNumber: 0 },
      });
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('SKIPPED');
    });
  });
});
