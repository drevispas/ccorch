/**
 * E2E Complexity Flow Integration Tests
 *
 * Tests the full CC-assisted complexity determination flow:
 * 1. Workflow created in PENDING_COMPLEXITY state
 * 2. CC analyzes complexity and calls set-complexity API
 * 3. Workflow transitions to ACTIVE with first agent prompt
 * 4. Workflow ready for agent execution
 *
 * WBS Reference: §5.11.7 (E2E complexity flow test)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import express, { Express } from 'express';
import request from 'supertest';
import { setComplexity } from '../../../src/api/routes/complexity.js';
import { WorkflowRepository } from '../../../src/models/workflow-repository.js';
import { TransitionRepository } from '../../../src/models/transition-repository.js';
import { generateComplexityAnalysisPrompt } from '../../../src/services/prompt-generator.js';

describe('E2E Complexity Flow', () => {
  let prisma: PrismaClient;
  let app: Express;
  let workflowRepo: WorkflowRepository;
  let transitionRepo: TransitionRepository;

  beforeEach(async () => {
    // Initialize Prisma with test database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'file:./test.db',
        },
      },
    });

    workflowRepo = new WorkflowRepository(prisma);
    transitionRepo = new TransitionRepository(prisma);

    // Setup Express app with set-complexity route
    app = express();
    app.use(express.json());
    app.post('/api/workflows/:workflowId/set-complexity', setComplexity);

    // Clear database
    await prisma.agentResult.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflow.deleteMany();
  });

  afterEach(async () => {
    // Cleanup
    await prisma.agentResult.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflow.deleteMany();
    await prisma.$disconnect();
  });

  describe('Full Complexity Determination Flow', () => {
    it('should complete full flow: PENDING_COMPLEXITY → CC analysis → ACTIVE', async () => {
      // Step 1: Simulate UserPromptSubmit hook creating workflow
      const userPrompt = 'Implement REST API for user authentication with JWT tokens';
      const draftComplexity = 'moderate'; // Initial guess

      const workflow = await workflowRepo.createWorkflow({
        userPrompt,
        chainName: 'backend-development',
        complexity: draftComplexity,
        draftComplexity,
        currentStep: -1, // Not started yet
        status: 'PENDING_COMPLEXITY',
      });

      // Verify initial workflow state
      expect(workflow.status).toBe('PENDING_COMPLEXITY');
      expect(workflow.complexity).toBe('moderate');
      expect(workflow.draftComplexity).toBe('moderate');
      expect(workflow.currentStep).toBe(-1);

      // Step 2: Simulate CC analyzing complexity prompt
      // (In real flow, UserPromptSubmit hook would return this prompt to CC)
      const complexityPrompt = generateComplexityAnalysisPrompt(
        userPrompt,
        draftComplexity,
        workflow.id,
        'http://localhost:3000'
      );

      expect(complexityPrompt).toContain(userPrompt);
      expect(complexityPrompt).toContain('simple');
      expect(complexityPrompt).toContain('moderate');
      expect(complexityPrompt).toContain('complex');
      expect(complexityPrompt).toContain(workflow.id);

      // Step 3: Simulate CC calling set-complexity API
      const ccDetermination = {
        complexity: 'complex' as const, // CC determines it's complex
        reasoning:
          'Multi-module changes required: API endpoints, authentication middleware, JWT service',
      };

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send(ccDetermination);

      // Verify API response
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        workflowId: workflow.id,
        complexity: 'complex',
      });
      expect(response.body.nextInstructions).toBeDefined();
      expect(response.body.nextInstructions).toContain('backend-architect-complex');
      expect(response.body.nextInstructions).toContain('subagent');

      // Step 4: Verify workflow state updated correctly
      const updatedWorkflow = await workflowRepo.findById(workflow.id);

      expect(updatedWorkflow).toBeDefined();
      expect(updatedWorkflow?.status).toBe('ACTIVE');
      expect(updatedWorkflow?.complexity).toBe('complex');
      expect(updatedWorkflow?.currentStep).toBe(0);
      expect(updatedWorkflow?.draftComplexity).toBe('moderate'); // Original draft preserved

      // Step 5: Verify transition recorded
      const transitions = await transitionRepo.findByWorkflowId(workflow.id);

      expect(transitions.length).toBeGreaterThanOrEqual(1);
      const complexityTransition = transitions.find(
        (t) => t.fromStep === -1 && t.toStep === 0
      );
      expect(complexityTransition).toBeDefined();
      expect(complexityTransition?.reason).toContain('Multi-module changes required');
    });

    it('should handle CC confirming draft complexity (no change)', async () => {
      const userPrompt = 'Add simple validation to form';
      const draftComplexity = 'simple';

      const workflow = await workflowRepo.createWorkflow({
        userPrompt,
        chainName: 'frontend-development',
        complexity: draftComplexity,
        draftComplexity,
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      // CC confirms the draft complexity
      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({
          complexity: 'simple', // Same as draft
          reasoning: 'Single file change, straightforward validation',
        });

      expect(response.status).toBe(200);
      expect(response.body.complexity).toBe('simple');

      const updatedWorkflow = await workflowRepo.findById(workflow.id);
      expect(updatedWorkflow?.status).toBe('ACTIVE');
      expect(updatedWorkflow?.complexity).toBe('simple');
      expect(updatedWorkflow?.draftComplexity).toBe('simple');
    });

    it('should handle CC downgrading complexity from draft', async () => {
      const userPrompt = 'Quick bug fix in authentication';
      const draftComplexity = 'complex'; // Initial guess is high

      const workflow = await workflowRepo.createWorkflow({
        userPrompt,
        chainName: 'debug',
        complexity: draftComplexity,
        draftComplexity,
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      // CC downgrades to simple
      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({
          complexity: 'simple', // Downgrade
          reasoning: 'Single-line fix, well-isolated issue',
        });

      expect(response.status).toBe(200);
      expect(response.body.complexity).toBe('simple');
      expect(response.body.nextInstructions).toContain('debugger-simple');

      const updatedWorkflow = await workflowRepo.findById(workflow.id);
      expect(updatedWorkflow?.complexity).toBe('simple');
      expect(updatedWorkflow?.draftComplexity).toBe('complex'); // Draft preserved
    });

    it('should handle CC upgrading complexity from draft', async () => {
      const userPrompt = 'Add user profile feature';
      const draftComplexity = 'simple'; // Initial guess is low

      const workflow = await workflowRepo.createWorkflow({
        userPrompt,
        chainName: 'backend-development',
        complexity: draftComplexity,
        draftComplexity,
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      // CC upgrades to moderate
      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({
          complexity: 'moderate', // Upgrade
          reasoning: 'Multiple files affected: routes, services, database schema',
        });

      expect(response.status).toBe(200);
      expect(response.body.complexity).toBe('moderate');
      expect(response.body.nextInstructions).toContain('backend-architect-moderate');

      const updatedWorkflow = await workflowRepo.findById(workflow.id);
      expect(updatedWorkflow?.complexity).toBe('moderate');
      expect(updatedWorkflow?.draftComplexity).toBe('simple'); // Draft preserved
    });
  });

  describe('Different Workflow Chains', () => {
    it('should handle backend-development chain with complexity', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Implement payment processing',
        chainName: 'backend-development',
        complexity: 'moderate',
        draftComplexity: 'moderate',
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({ complexity: 'complex' });

      expect(response.status).toBe(200);
      expect(response.body.nextInstructions).toContain('backend-architect-complex');

      const updated = await workflowRepo.findById(workflow.id);
      expect(updated?.status).toBe('ACTIVE');
      expect(updated?.currentStep).toBe(0);
    });

    it('should handle frontend-development chain with complexity', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Create dashboard component',
        chainName: 'frontend-development',
        complexity: 'simple',
        draftComplexity: 'simple',
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({ complexity: 'moderate' });

      expect(response.status).toBe(200);
      expect(response.body.nextInstructions).toContain('frontend-architect-moderate');

      const updated = await workflowRepo.findById(workflow.id);
      expect(updated?.status).toBe('ACTIVE');
      expect(updated?.currentStep).toBe(0);
    });

    it('should handle debug chain with complexity', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Debug memory leak issue',
        chainName: 'debug',
        complexity: 'moderate',
        draftComplexity: 'moderate',
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({ complexity: 'complex' });

      expect(response.status).toBe(200);
      expect(response.body.nextInstructions).toContain('debugger-complex');

      const updated = await workflowRepo.findById(workflow.id);
      expect(updated?.status).toBe('ACTIVE');
    });

    it('should handle single-agent chains with complexity', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Review code quality',
        chainName: 'review-only',
        complexity: 'simple',
        draftComplexity: 'simple',
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({ complexity: 'moderate' });

      expect(response.status).toBe(200);
      expect(response.body.nextInstructions).toContain('reviewer-moderate');

      const updated = await workflowRepo.findById(workflow.id);
      expect(updated?.status).toBe('ACTIVE');
      expect(updated?.currentStep).toBe(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should preserve user prompt through complexity flow', async () => {
      const userPrompt = 'Build complex microservices architecture with event sourcing';

      const workflow = await workflowRepo.createWorkflow({
        userPrompt,
        chainName: 'backend-development',
        complexity: 'moderate',
        draftComplexity: 'moderate',
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({ complexity: 'complex' });

      const updated = await workflowRepo.findById(workflow.id);
      expect(updated?.userPrompt).toBe(userPrompt);
    });

    it('should record complexity reasoning in transitions', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Test task',
        chainName: 'backend-development',
        complexity: 'moderate',
        draftComplexity: 'moderate',
        currentStep: -1,
        status: 'PENDING_COMPLEXITY',
      });

      const reasoning = 'Requires database migration and API versioning';

      await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({ complexity: 'complex', reasoning });

      const transitions = await transitionRepo.findByWorkflowId(workflow.id);
      const complexityTransition = transitions.find((t) => t.fromStep === -1);

      expect(complexityTransition?.reason).toContain(reasoning);
    });

    it('should handle workflow already in ACTIVE state (409)', async () => {
      const workflow = await workflowRepo.createWorkflow({
        userPrompt: 'Task',
        chainName: 'backend-development',
        complexity: 'moderate',
        currentStep: 0,
        status: 'ACTIVE', // Already active
      });

      const response = await request(app)
        .post(`/api/workflows/${workflow.id}/set-complexity`)
        .send({ complexity: 'complex' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVALID_STATE');
    });

    it('should validate complexity prompt contains all required elements', () => {
      const prompt = generateComplexityAnalysisPrompt(
        'Test task',
        'moderate',
        'wf-123',
        'http://localhost:3000'
      );

      // Verify prompt structure
      expect(prompt).toContain('Test task'); // User's task
      expect(prompt).toContain('simple'); // Complexity options
      expect(prompt).toContain('moderate');
      expect(prompt).toContain('complex');
      expect(prompt).toContain('wf-123'); // Workflow ID
      expect(prompt).toContain('http://localhost:3000/api/workflows/wf-123/set-complexity'); // API endpoint
      expect(prompt).toContain('POST'); // HTTP method
    });
  });

  describe('Complexity Analysis Accuracy', () => {
    it('should provide accurate prompt for CC to determine complexity', async () => {
      const testCases = [
        {
          userPrompt: 'Add console.log statement',
          expectedDraft: 'simple',
          chainName: 'backend-only',
        },
        {
          userPrompt: 'Implement user authentication system',
          expectedDraft: 'moderate',
          chainName: 'backend-development',
        },
        {
          userPrompt: 'Design and implement enterprise-wide microservices architecture',
          expectedDraft: 'complex',
          chainName: 'backend-development',
        },
      ];

      for (const testCase of testCases) {
        const prompt = generateComplexityAnalysisPrompt(
          testCase.userPrompt,
          testCase.expectedDraft,
          'wf-test',
          'http://localhost:3000'
        );

        // Verify prompt contains user's task
        expect(prompt).toContain(testCase.userPrompt);

        // Verify prompt includes complexity guidelines
        expect(prompt.toLowerCase()).toContain('complexity');

        // Verify API endpoint is correct
        expect(prompt).toContain('/api/workflows/wf-test/set-complexity');
      }
    });
  });
});
