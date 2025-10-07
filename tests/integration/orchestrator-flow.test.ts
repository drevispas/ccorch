/**
 * Orchestrator Integration Tests
 *
 * End-to-end tests for complete workflow orchestration from user prompt
 * to chain completion. Tests full integration of orchestrator with repositories.
 *
 * WBS Reference: §5.10.2 (Test orchestrator integration E2E)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Orchestrator } from '../../src/services/orchestrator';
import { StateManager } from '../../src/services/state-manager';
import { WorkflowRepository } from '../../src/models/workflow-repository';
import { AgentResultRepository } from '../../src/models/agent-result-repository';
import { TransitionRepository } from '../../src/models/transition-repository';
import { AgentRole, Complexity, ChainName } from '../../src/types/workflow';

describe('Orchestrator Integration - E2E Flow', () => {
  let prisma: PrismaClient;
  let orchestrator: Orchestrator;
  let workflowRepo: WorkflowRepository;
  let agentResultRepo: AgentResultRepository;
  let transitionRepo: TransitionRepository;
  let stateManager: StateManager;

  beforeEach(async () => {
    // Initialize Prisma with test database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'file:./test.db',
        },
      },
    });

    // Initialize repositories
    workflowRepo = new WorkflowRepository(prisma);
    agentResultRepo = new AgentResultRepository(prisma);
    transitionRepo = new TransitionRepository(prisma);

    // Initialize state manager
    stateManager = new StateManager(workflowRepo, transitionRepo);

    // Initialize orchestrator
    orchestrator = new Orchestrator(stateManager, agentResultRepo);

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

  describe('Full Backend Development Workflow', () => {
    it('should complete full backend-development chain (architect → developer → reviewer)', async () => {
      // Step 1: User submits prompt
      const userPrompt = 'Implement REST API for user authentication with JWT tokens';

      const initialResponse = await orchestrator.handleUserPrompt(userPrompt);

      expect(initialResponse.workflowId).toBeDefined();
      expect(initialResponse.agentRole).toBe(AgentRole.BACKEND_ARCHITECT);
      expect(initialResponse.complexity).toBe(Complexity.MODERATE);
      expect(initialResponse.prompt).toContain('backend-architect-moderate');
      expect(initialResponse.prompt).toContain(userPrompt);

      const workflowId = initialResponse.workflowId;

      // Verify workflow created in database
      const workflow1 = await workflowRepo.findById(workflowId);
      expect(workflow1).not.toBeNull();
      expect(workflow1?.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
      expect(workflow1?.currentStep).toBe(0);
      expect(workflow1?.status).toBe('ACTIVE');

      // Step 2: Backend architect completes
      const architectResults = {
        workflowId,
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: Complexity.MODERATE,
        stepNumber: 0,
        results: JSON.stringify({
          summary: 'Designed REST API with JWT authentication endpoints',
          design: {
            endpoints: ['/auth/login', '/auth/register', '/auth/refresh'],
            security: 'JWT with refresh tokens',
          },
        }),
        status: 'COMPLETED' as const,
      };

      const architectResponse = await orchestrator.handleAgentComplete(
        workflowId,
        architectResults
      );

      expect(architectResponse.status).toBe('continue');
      expect(architectResponse.agentRole).toBe(AgentRole.BACKEND_DEVELOPER);
      expect(architectResponse.prompt).toContain('java-backend-developer-moderate');
      expect(architectResponse.prompt).toContain('Review previous results');
      expect(architectResponse.prompt).toContain(
        'Designed REST API with JWT authentication endpoints'
      );

      // Verify step advancement
      const workflow2 = await workflowRepo.findById(workflowId);
      expect(workflow2?.currentStep).toBe(1);

      // Verify agent result stored
      const results1 = await agentResultRepo.findByWorkflowId(workflowId);
      expect(results1).toHaveLength(1);
      expect(results1[0].agentRole).toBe(AgentRole.BACKEND_ARCHITECT);

      // Step 3: Backend developer completes
      const developerResults = {
        workflowId,
        agentRole: AgentRole.BACKEND_DEVELOPER,
        complexity: Complexity.MODERATE,
        stepNumber: 1,
        results: JSON.stringify({
          summary:
            'Implemented authentication API with JWT tokens and refresh logic',
          filesModified: [
            'src/routes/auth.ts',
            'src/middleware/auth.ts',
            'src/services/token.ts',
          ],
        }),
        status: 'COMPLETED' as const,
      };

      const developerResponse = await orchestrator.handleAgentComplete(
        workflowId,
        developerResults
      );

      expect(developerResponse.status).toBe('continue');
      expect(developerResponse.agentRole).toBe(AgentRole.REVIEWER);
      expect(developerResponse.prompt).toContain('reviewer-moderate');
      expect(developerResponse.prompt).toContain('Review previous results');
      expect(developerResponse.prompt).toContain(
        'Designed REST API with JWT authentication endpoints'
      );
      expect(developerResponse.prompt).toContain(
        'Implemented authentication API with JWT tokens and refresh logic'
      );

      // Verify step advancement
      const workflow3 = await workflowRepo.findById(workflowId);
      expect(workflow3?.currentStep).toBe(2);

      // Verify both agent results stored
      const results2 = await agentResultRepo.findByWorkflowId(workflowId);
      expect(results2).toHaveLength(2);

      // Step 4: Reviewer completes (final step)
      const reviewerResults = {
        workflowId,
        agentRole: AgentRole.REVIEWER,
        complexity: Complexity.MODERATE,
        stepNumber: 2,
        results: JSON.stringify({
          summary: 'Code review complete. Authentication implementation approved.',
          issuesFound: [],
          recommendations: ['Add rate limiting to login endpoint'],
        }),
        status: 'COMPLETED' as const,
      };

      const reviewerResponse = await orchestrator.handleAgentComplete(
        workflowId,
        reviewerResults
      );

      expect(reviewerResponse.status).toBe('completed');
      expect(reviewerResponse.message).toContain('Workflow complete');
      expect(reviewerResponse.workflowId).toBe(workflowId);

      // Verify workflow marked as completed
      const workflow4 = await workflowRepo.findById(workflowId);
      expect(workflow4?.status).toBe('COMPLETED');

      // Verify all three agent results stored
      const results3 = await agentResultRepo.findByWorkflowId(workflowId);
      expect(results3).toHaveLength(3);
      expect(results3.map((r) => r.agentRole)).toEqual([
        AgentRole.BACKEND_ARCHITECT,
        AgentRole.BACKEND_DEVELOPER,
        AgentRole.REVIEWER,
      ]);

      // Verify transitions recorded
      const transitions = await transitionRepo.findByWorkflowId(workflowId);
      expect(transitions.length).toBeGreaterThanOrEqual(3); // At least one per step advancement
    });
  });

  describe('Frontend Development Workflow', () => {
    it('should complete full frontend-development chain (architect → developer → reviewer)', async () => {
      // Step 1: User submits frontend prompt
      const userPrompt = 'Create React login form component with validation';

      const initialResponse = await orchestrator.handleUserPrompt(userPrompt);

      expect(initialResponse.agentRole).toBe(AgentRole.FRONTEND_ARCHITECT);
      expect(initialResponse.complexity).toBe(Complexity.MODERATE);

      const workflowId = initialResponse.workflowId;

      // Step 2: Frontend architect completes
      const architectResults = {
        workflowId,
        agentRole: AgentRole.FRONTEND_ARCHITECT,
        complexity: Complexity.MODERATE,
        stepNumber: 0,
        results: JSON.stringify({
          summary: 'Designed login form component with form validation',
        }),
        status: 'COMPLETED' as const,
      };

      const architectResponse = await orchestrator.handleAgentComplete(
        workflowId,
        architectResults
      );

      expect(architectResponse.agentRole).toBe(AgentRole.FRONTEND_DEVELOPER);

      // Step 3: Frontend developer completes
      const developerResults = {
        workflowId,
        agentRole: AgentRole.FRONTEND_DEVELOPER,
        complexity: Complexity.MODERATE,
        stepNumber: 1,
        results: JSON.stringify({
          summary: 'Implemented LoginForm component with validation',
        }),
        status: 'COMPLETED' as const,
      };

      const developerResponse = await orchestrator.handleAgentComplete(
        workflowId,
        developerResults
      );

      expect(developerResponse.agentRole).toBe(AgentRole.REVIEWER);

      // Step 4: Reviewer completes
      const reviewerResults = {
        workflowId,
        agentRole: AgentRole.REVIEWER,
        complexity: Complexity.MODERATE,
        stepNumber: 2,
        results: JSON.stringify({
          summary: 'Code review complete. Component implementation approved.',
        }),
        status: 'COMPLETED' as const,
      };

      const reviewerResponse = await orchestrator.handleAgentComplete(
        workflowId,
        reviewerResults
      );

      expect(reviewerResponse.status).toBe('completed');

      // Verify workflow completed
      const workflow = await workflowRepo.findById(workflowId);
      expect(workflow?.status).toBe('COMPLETED');
    });
  });

  describe('Debug Workflow', () => {
    it('should complete debug chain (debugger → developer → reviewer)', async () => {
      const userPrompt = 'Debug authentication failing with 401 errors';

      const initialResponse = await orchestrator.handleUserPrompt(userPrompt);

      expect(initialResponse.agentRole).toBe(AgentRole.DEBUGGER);
      expect(initialResponse.prompt).toContain('issue-detective');

      const workflowId = initialResponse.workflowId;

      // Debugger identifies issue
      const debuggerResults = {
        workflowId,
        agentRole: AgentRole.DEBUGGER,
        complexity: initialResponse.complexity as Complexity,
        stepNumber: 0,
        results: JSON.stringify({
          summary: 'Root cause: JWT secret mismatch between services',
        }),
        status: 'COMPLETED' as const,
      };

      const debuggerResponse = await orchestrator.handleAgentComplete(
        workflowId,
        debuggerResults
      );

      // Should route to backend developer (based on keywords)
      expect(debuggerResponse.agentRole).toBe(AgentRole.BACKEND_DEVELOPER);

      // Developer fixes
      const developerResults = {
        workflowId,
        agentRole: AgentRole.BACKEND_DEVELOPER,
        complexity: initialResponse.complexity as Complexity,
        stepNumber: 1,
        results: JSON.stringify({
          summary: 'Fixed JWT secret configuration',
        }),
        status: 'COMPLETED' as const,
      };

      const developerResponse = await orchestrator.handleAgentComplete(
        workflowId,
        developerResults
      );

      expect(developerResponse.agentRole).toBe(AgentRole.REVIEWER);

      // Reviewer verifies fix
      const reviewerResults = {
        workflowId,
        agentRole: AgentRole.REVIEWER,
        complexity: initialResponse.complexity as Complexity,
        stepNumber: 2,
        results: JSON.stringify({
          summary: 'Fix verified. Authentication working correctly.',
        }),
        status: 'COMPLETED' as const,
      };

      const reviewerResponse = await orchestrator.handleAgentComplete(
        workflowId,
        reviewerResults
      );

      expect(reviewerResponse.status).toBe('completed');
    });
  });

  describe('Simple Workflow Chains', () => {
    it('should complete simple backend task requiring full chain', async () => {
      const userPrompt = 'Just add a single line comment to document the function';

      const initialResponse = await orchestrator.handleUserPrompt(userPrompt);

      // Even simple tasks may route through full chain for quality
      expect(initialResponse.agentRole).toBe(AgentRole.BACKEND_ARCHITECT);
      expect(initialResponse.complexity).toBe('simple');

      const workflowId = initialResponse.workflowId;

      // Complete full backend-development chain at simple complexity
      // Step 1: Architect
      const architectResults = {
        workflowId,
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: initialResponse.complexity as Complexity,
        stepNumber: 0,
        results: JSON.stringify({
          summary: 'Designed documentation approach',
        }),
        status: 'COMPLETED' as const,
      };

      const architectResponse = await orchestrator.handleAgentComplete(
        workflowId,
        architectResults
      );

      expect(architectResponse.status).toBe('continue');

      // Step 2: Developer
      const developerResults = {
        workflowId,
        agentRole: AgentRole.BACKEND_DEVELOPER,
        complexity: initialResponse.complexity as Complexity,
        stepNumber: 1,
        results: JSON.stringify({
          summary: 'Added documentation comment to function',
        }),
        status: 'COMPLETED' as const,
      };

      const developerResponse = await orchestrator.handleAgentComplete(
        workflowId,
        developerResults
      );

      expect(developerResponse.status).toBe('continue');

      // Step 3: Reviewer
      const reviewerResults = {
        workflowId,
        agentRole: AgentRole.REVIEWER,
        complexity: initialResponse.complexity as Complexity,
        stepNumber: 2,
        results: JSON.stringify({
          summary: 'Documentation approved',
        }),
        status: 'COMPLETED' as const,
      };

      const reviewerResponse = await orchestrator.handleAgentComplete(
        workflowId,
        reviewerResults
      );

      expect(reviewerResponse.status).toBe('completed');

      const workflow = await workflowRepo.findById(workflowId);
      expect(workflow?.status).toBe('COMPLETED');
      expect(workflow?.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);
      expect(workflow?.complexity).toBe('simple');
    });

    it('should complete review-only chain (single agent)', async () => {
      const userPrompt = 'Just review the authentication code quality';

      const initialResponse = await orchestrator.handleUserPrompt(userPrompt);

      expect(initialResponse.agentRole).toBe(AgentRole.REVIEWER);

      const workflowId = initialResponse.workflowId;

      const reviewerResults = {
        workflowId,
        agentRole: AgentRole.REVIEWER,
        complexity: initialResponse.complexity as Complexity,
        stepNumber: 0,
        results: JSON.stringify({
          summary: 'Security review complete',
        }),
        status: 'COMPLETED' as const,
      };

      const reviewerResponse = await orchestrator.handleAgentComplete(
        workflowId,
        reviewerResults
      );

      expect(reviewerResponse.status).toBe('completed');
      expect(reviewerResponse.message).toContain('Workflow complete');

      const workflow = await workflowRepo.findById(workflowId);
      expect(workflow?.status).toBe('COMPLETED');
      expect(workflow?.chainName).toBe(ChainName.REVIEW_ONLY);
    });
  });

  describe('Error Handling', () => {
    it('should handle agent failure and mark workflow as failed', async () => {
      const userPrompt = 'Implement backend API';

      const initialResponse = await orchestrator.handleUserPrompt(userPrompt);
      const workflowId = initialResponse.workflowId;

      // First agent fails
      const failedResults = {
        workflowId,
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: initialResponse.complexity as Complexity,
        stepNumber: 0,
        results: JSON.stringify({
          summary: 'Failed to design API',
          error: 'Insufficient requirements',
        }),
        status: 'FAILED' as const,
      };

      const failedResponse = await orchestrator.handleAgentComplete(
        workflowId,
        failedResults
      );

      expect(failedResponse.status).toBe('failed');
      expect(failedResponse.message).toContain('failed');

      // Verify workflow marked as failed
      const workflow = await workflowRepo.findById(workflowId);
      expect(workflow?.status).toBe('FAILED');
    });

    it('should reject duplicate step submissions (idempotency)', async () => {
      const userPrompt = 'Implement backend API';

      const initialResponse = await orchestrator.handleUserPrompt(userPrompt);
      const workflowId = initialResponse.workflowId;

      // First agent completes
      const results = {
        workflowId,
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: initialResponse.complexity as Complexity,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Design complete' }),
        status: 'COMPLETED' as const,
      };

      await orchestrator.handleAgentComplete(workflowId, results);

      // Try to submit same step again
      await expect(
        orchestrator.handleAgentComplete(workflowId, results)
      ).rejects.toThrow();
    });
  });

  describe('Context Propagation', () => {
    it('should propagate context through all workflow steps', async () => {
      const userPrompt = 'Implement user profile API';

      const initialResponse = await orchestrator.handleUserPrompt(userPrompt);
      const workflowId = initialResponse.workflowId;

      // Step 1: Architect
      const architectResults = {
        workflowId,
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: initialResponse.complexity as Complexity,
        stepNumber: 0,
        results: JSON.stringify({
          summary: 'ARCHITECT SUMMARY: Designed user profile endpoints',
        }),
        status: 'COMPLETED' as const,
      };

      const architectResponse = await orchestrator.handleAgentComplete(
        workflowId,
        architectResults
      );

      // Verify context includes architect summary
      expect(architectResponse.prompt).toContain(
        'ARCHITECT SUMMARY: Designed user profile endpoints'
      );

      // Step 2: Developer
      const developerResults = {
        workflowId,
        agentRole: AgentRole.BACKEND_DEVELOPER,
        complexity: initialResponse.complexity as Complexity,
        stepNumber: 1,
        results: JSON.stringify({
          summary: 'DEVELOPER SUMMARY: Implemented profile CRUD operations',
        }),
        status: 'COMPLETED' as const,
      };

      const developerResponse = await orchestrator.handleAgentComplete(
        workflowId,
        developerResults
      );

      // Verify context includes both architect and developer summaries
      expect(developerResponse.prompt).toContain(
        'ARCHITECT SUMMARY: Designed user profile endpoints'
      );
      expect(developerResponse.prompt).toContain(
        'DEVELOPER SUMMARY: Implemented profile CRUD operations'
      );
    });
  });
});
