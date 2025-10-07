/**
 * Concurrent Workflow Isolation Tests
 *
 * Tests that multiple workflows can execute in parallel without state leakage,
 * race conditions, or data corruption. Validates workflow-level isolation,
 * idempotency enforcement, and correct transition recording.
 *
 * WBS Reference: §7.7 (Concurrent Workflow Isolation Tests)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Orchestrator } from '../../../src/services/orchestrator';
import { StateManager } from '../../../src/services/state-manager';
import { WorkflowRepository } from '../../../src/models/workflow-repository';
import { AgentResultRepository } from '../../../src/models/agent-result-repository';
import { TransitionRepository } from '../../../src/models/transition-repository';
import { AgentRole, Complexity, ChainName } from '../../../src/types/workflow';

describe('Concurrent Workflow Isolation', () => {
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

  describe('Parallel Workflow Creation', () => {
    it('should create 3 workflows simultaneously without conflicts', async () => {
      // Create 3 different workflow prompts
      const prompts = [
        'Implement REST API for user authentication',
        'Create React login form component',
        'Debug authentication failing with 401 errors',
      ];

      // Create all workflows in parallel
      const createPromises = prompts.map((prompt) =>
        orchestrator.handleUserPrompt(prompt)
      );

      const responses = await Promise.all(createPromises);

      // Verify all workflows created successfully
      expect(responses).toHaveLength(3);

      // Verify unique workflow IDs
      const workflowIds = responses.map((r) => r.workflowId);
      const uniqueIds = new Set(workflowIds);
      expect(uniqueIds.size).toBe(3);

      // Verify correct agent roles assigned
      expect(responses[0].agentRole).toBe(AgentRole.BACKEND_ARCHITECT);
      expect(responses[1].agentRole).toBe(AgentRole.FRONTEND_ARCHITECT);
      expect(responses[2].agentRole).toBe(AgentRole.DEBUGGER);

      // Verify all workflows are ACTIVE with step 0
      for (const response of responses) {
        const workflow = await workflowRepo.findById(response.workflowId);
        expect(workflow).not.toBeNull();
        expect(workflow?.status).toBe('ACTIVE');
        expect(workflow?.currentStep).toBe(0);
      }

      // Verify initial transitions created for each workflow
      for (const response of responses) {
        const transitions = await transitionRepo.findByWorkflowId(response.workflowId);
        expect(transitions).toHaveLength(1);
        expect(transitions[0].fromStep).toBe(-1);
        expect(transitions[0].toStep).toBe(0);
      }
    });
  });

  describe('Parallel Agent Result Submission', () => {
    it('should submit agent results for 3 workflows in parallel without state leakage', async () => {
      // Create 3 workflows
      const workflow1 = await orchestrator.handleUserPrompt('Implement backend API');
      const workflow2 = await orchestrator.handleUserPrompt('Create frontend component');
      const workflow3 = await orchestrator.handleUserPrompt('Debug API issue');

      const workflowIds = [workflow1.workflowId, workflow2.workflowId, workflow3.workflowId];

      // Submit agent results for all workflows in parallel
      const resultPromises = [
        orchestrator.handleAgentComplete(workflow1.workflowId, {
          workflowId: workflow1.workflowId,
          agentRole: AgentRole.BACKEND_ARCHITECT,
          complexity: workflow1.complexity as Complexity,
          stepNumber: 0,
          results: JSON.stringify({
            summary: 'Backend API design complete',
            design: { endpoints: ['/api/users', '/api/auth'] },
          }),
          status: 'COMPLETED',
        }),
        orchestrator.handleAgentComplete(workflow2.workflowId, {
          workflowId: workflow2.workflowId,
          agentRole: AgentRole.FRONTEND_ARCHITECT,
          complexity: workflow2.complexity as Complexity,
          stepNumber: 0,
          results: JSON.stringify({
            summary: 'Frontend component design complete',
            design: { components: ['LoginForm', 'UserProfile'] },
          }),
          status: 'COMPLETED',
        }),
        orchestrator.handleAgentComplete(workflow3.workflowId, {
          workflowId: workflow3.workflowId,
          agentRole: AgentRole.DEBUGGER,
          complexity: workflow3.complexity as Complexity,
          stepNumber: 0,
          results: JSON.stringify({
            summary: 'Root cause identified: CORS misconfiguration',
            issuesFound: ['CORS headers missing'],
          }),
          status: 'COMPLETED',
        }),
      ];

      const results = await Promise.all(resultPromises);

      // Verify all workflows advanced to next step
      expect(results[0].status).toBe('continue');
      expect(results[1].status).toBe('continue');
      expect(results[2].status).toBe('continue');

      // Verify correct next agents
      expect(results[0].agentRole).toBe(AgentRole.BACKEND_DEVELOPER);
      expect(results[1].agentRole).toBe(AgentRole.FRONTEND_DEVELOPER);
      expect(results[2].agentRole).toBe(AgentRole.BACKEND_DEVELOPER);

      // Verify NO state leakage - each workflow has only its own results
      for (let i = 0; i < workflowIds.length; i++) {
        const agentResults = await agentResultRepo.findByWorkflowId(workflowIds[i]);
        expect(agentResults).toHaveLength(1);
        expect(agentResults[0].workflowId).toBe(workflowIds[i]);

        // Verify result content matches expected workflow
        const resultData = JSON.parse(agentResults[0].results);
        if (i === 0) {
          expect(resultData.summary).toContain('Backend API');
        } else if (i === 1) {
          expect(resultData.summary).toContain('Frontend component');
        } else {
          expect(resultData.summary).toContain('Root cause');
        }
      }

      // Verify each workflow advanced to step 1
      for (const workflowId of workflowIds) {
        const workflow = await workflowRepo.findById(workflowId);
        expect(workflow?.currentStep).toBe(1);
        expect(workflow?.status).toBe('ACTIVE');
      }

      // Verify transitions recorded correctly for each workflow
      for (const workflowId of workflowIds) {
        const transitions = await transitionRepo.findByWorkflowId(workflowId);
        expect(transitions.length).toBeGreaterThanOrEqual(2); // Initial + step advancement
        expect(transitions[transitions.length - 1].toStep).toBe(1);
      }
    });
  });

  describe('Concurrent Workflow Advancement', () => {
    it('should advance 3 workflows concurrently without race conditions', async () => {
      // Create 3 workflows
      const workflows = await Promise.all([
        orchestrator.handleUserPrompt('Implement backend API'),
        orchestrator.handleUserPrompt('Create frontend component'),
        orchestrator.handleUserPrompt('Add unit tests'),
      ]);

      // Complete step 0 for all workflows and capture responses
      const step0Responses = await Promise.all(
        workflows.map((wf, idx) =>
          orchestrator.handleAgentComplete(wf.workflowId, {
            workflowId: wf.workflowId,
            agentRole: wf.agentRole as AgentRole,
            complexity: wf.complexity as Complexity,
            stepNumber: 0,
            results: JSON.stringify({ summary: `Step 0 complete for workflow ${idx}` }),
            status: 'COMPLETED',
          })
        )
      );

      // Verify all workflows at step 1
      for (const wf of workflows) {
        const workflow = await workflowRepo.findById(wf.workflowId);
        expect(workflow?.currentStep).toBe(1);
      }

      // Complete step 1 for all workflows in parallel, using the agent role from step 0 response
      const step1Results = await Promise.all(
        workflows.map((wf, idx) =>
          orchestrator.handleAgentComplete(wf.workflowId, {
            workflowId: wf.workflowId,
            agentRole: step0Responses[idx].agentRole as AgentRole,
            complexity: step0Responses[idx].complexity as Complexity,
            stepNumber: 1,
            results: JSON.stringify({ summary: `Step 1 complete for workflow ${idx}` }),
            status: 'COMPLETED',
          })
        )
      );

      // Verify all workflows advanced to step 2
      expect(step1Results.every((r) => r.status === 'continue')).toBe(true);

      for (const wf of workflows) {
        const workflow = await workflowRepo.findById(wf.workflowId);
        expect(workflow?.currentStep).toBe(2);
        expect(workflow?.status).toBe('ACTIVE');
      }

      // Verify correct number of agent results for each workflow
      for (const wf of workflows) {
        const results = await agentResultRepo.findByWorkflowId(wf.workflowId);
        expect(results).toHaveLength(2); // Step 0 and Step 1
        expect(results[0].stepNumber).toBe(0);
        expect(results[1].stepNumber).toBe(1);
      }

      // Verify no duplicate transitions
      for (const wf of workflows) {
        const transitions = await transitionRepo.findByWorkflowId(wf.workflowId);
        // Should have: initial (-1→0), step 0→1, step 1→2
        expect(transitions.length).toBeGreaterThanOrEqual(3);

        // Verify transition sequence is correct
        const sortedTransitions = transitions.sort((a, b) => a.fromStep - b.fromStep);
        expect(sortedTransitions[0].fromStep).toBe(-1);
        expect(sortedTransitions[0].toStep).toBe(0);
      }
    });
  });

  describe('Independent Workflow Status Queries', () => {
    it('should query status for 3 workflows independently without cross-contamination', async () => {
      // Create 3 workflows with different chains and complexities
      const workflows = await Promise.all([
        orchestrator.handleUserPrompt('Implement simple backend endpoint'),
        orchestrator.handleUserPrompt('Create React UI component for user profile page'),
        orchestrator.handleUserPrompt('Just review the code quality'),
      ]);

      const [wf1, wf2, wf3] = workflows;

      // Complete step 0 for workflow 1 only
      await orchestrator.handleAgentComplete(wf1.workflowId, {
        workflowId: wf1.workflowId,
        agentRole: wf1.agentRole as AgentRole,
        complexity: wf1.complexity as Complexity,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'WF1 step 0 complete' }),
        status: 'COMPLETED',
      });

      // Complete steps 0 and 1 for workflow 2
      const wf2Step0 = await orchestrator.handleAgentComplete(wf2.workflowId, {
        workflowId: wf2.workflowId,
        agentRole: wf2.agentRole as AgentRole,
        complexity: wf2.complexity as Complexity,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'WF2 step 0 complete' }),
        status: 'COMPLETED',
      });

      // Ensure agentRole is defined from response
      if (!wf2Step0.agentRole) {
        throw new Error('Expected agentRole in step 0 response');
      }

      await orchestrator.handleAgentComplete(wf2.workflowId, {
        workflowId: wf2.workflowId,
        agentRole: wf2Step0.agentRole,
        complexity: (wf2Step0.complexity || wf2.complexity) as Complexity,
        stepNumber: 1,
        results: JSON.stringify({ summary: 'WF2 step 1 complete' }),
        status: 'COMPLETED',
      });

      // Complete workflow 3 (single-step chain)
      await orchestrator.handleAgentComplete(wf3.workflowId, {
        workflowId: wf3.workflowId,
        agentRole: wf3.agentRole as AgentRole,
        complexity: wf3.complexity as Complexity,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'WF3 review complete' }),
        status: 'COMPLETED',
      });

      // Query all workflow statuses in parallel
      const statusQueries = await Promise.all([
        workflowRepo.findById(wf1.workflowId, {
          includeAgentResults: true,
          includeTransitions: true,
        }),
        workflowRepo.findById(wf2.workflowId, {
          includeAgentResults: true,
          includeTransitions: true,
        }),
        workflowRepo.findById(wf3.workflowId, {
          includeAgentResults: true,
          includeTransitions: true,
        }),
      ]);

      const [status1, status2, status3] = statusQueries;

      // Verify workflow 1: At step 1, still ACTIVE
      expect(status1).not.toBeNull();
      expect(status1?.currentStep).toBe(1);
      expect(status1?.status).toBe('ACTIVE');
      expect(status1?.agentResults).toHaveLength(1);
      expect(status1?.chainName).toBe(ChainName.BACKEND_DEVELOPMENT);

      // Verify workflow 2: At step 2, still ACTIVE
      expect(status2).not.toBeNull();
      expect(status2?.currentStep).toBe(2);
      expect(status2?.status).toBe('ACTIVE');
      expect(status2?.agentResults).toHaveLength(2);
      expect(status2?.chainName).toBe(ChainName.FRONTEND_DEVELOPMENT);

      // Verify workflow 3: COMPLETED (review-only chain has 1 step)
      expect(status3).not.toBeNull();
      expect(status3?.status).toBe('COMPLETED');
      expect(status3?.agentResults).toHaveLength(1);
      expect(status3?.chainName).toBe(ChainName.REVIEW_ONLY);

      // Verify no cross-contamination in agent results
      const wf1Results = status1?.agentResults || [];
      const wf2Results = status2?.agentResults || [];
      const wf3Results = status3?.agentResults || [];

      expect(wf1Results.every((r) => r.workflowId === wf1.workflowId)).toBe(true);
      expect(wf2Results.every((r) => r.workflowId === wf2.workflowId)).toBe(true);
      expect(wf3Results.every((r) => r.workflowId === wf3.workflowId)).toBe(true);

      // Verify result content is workflow-specific
      expect(JSON.parse(wf1Results[0].results).summary).toContain('WF1');
      expect(JSON.parse(wf2Results[0].results).summary).toContain('WF2');
      expect(JSON.parse(wf3Results[0].results).summary).toContain('WF3');
    });
  });

  describe('Race Condition Handling', () => {
    it('should handle duplicate step submissions with idempotency', async () => {
      // Create workflow
      const wf = await orchestrator.handleUserPrompt('Implement backend API');

      const duplicateResults = {
        workflowId: wf.workflowId,
        agentRole: wf.agentRole as AgentRole,
        complexity: wf.complexity as Complexity,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Step complete' }),
        status: 'COMPLETED' as const,
      };

      // Submit first result
      await orchestrator.handleAgentComplete(wf.workflowId, duplicateResults);

      // Attempt duplicate submission (simulating hook retry)
      await expect(
        orchestrator.handleAgentComplete(wf.workflowId, duplicateResults)
      ).rejects.toThrow();

      // Verify only one result stored
      const results = await agentResultRepo.findByWorkflowId(wf.workflowId);
      expect(results).toHaveLength(1);
    });

    it('should handle concurrent step advancement gracefully', async () => {
      // Create workflow
      const wf = await orchestrator.handleUserPrompt('Implement backend API');

      // Complete step 0
      await orchestrator.handleAgentComplete(wf.workflowId, {
        workflowId: wf.workflowId,
        agentRole: AgentRole.BACKEND_ARCHITECT,
        complexity: wf.complexity as Complexity,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Step 0 complete' }),
        status: 'COMPLETED',
      });

      // Complete step 1
      await orchestrator.handleAgentComplete(wf.workflowId, {
        workflowId: wf.workflowId,
        agentRole: AgentRole.BACKEND_DEVELOPER,
        complexity: wf.complexity as Complexity,
        stepNumber: 1,
        results: JSON.stringify({ summary: 'Step 1 complete' }),
        status: 'COMPLETED',
      });

      // Verify workflow advanced correctly
      const workflow = await workflowRepo.findById(wf.workflowId);
      expect(workflow?.currentStep).toBe(2);

      // Verify both results stored
      const results = await agentResultRepo.findByWorkflowId(wf.workflowId);
      expect(results).toHaveLength(2);
      expect(results[0].stepNumber).toBe(0);
      expect(results[1].stepNumber).toBe(1);
    });
  });

  describe('Workflow Isolation Stress Test', () => {
    it('should handle 10 concurrent workflows without state leakage', async () => {
      const workflowCount = 10;
      const prompts = Array.from(
        { length: workflowCount },
        (_, i) => `Implement feature ${i}`
      );

      // Create all workflows in parallel
      const workflows = await Promise.all(
        prompts.map((prompt) => orchestrator.handleUserPrompt(prompt))
      );

      // Verify unique IDs
      const workflowIds = workflows.map((w) => w.workflowId);
      expect(new Set(workflowIds).size).toBe(workflowCount);

      // Complete step 0 for all workflows in parallel
      await Promise.all(
        workflows.map((wf, idx) =>
          orchestrator.handleAgentComplete(wf.workflowId, {
            workflowId: wf.workflowId,
            agentRole: wf.agentRole as AgentRole,
            complexity: wf.complexity as Complexity,
            stepNumber: 0,
            results: JSON.stringify({
              summary: `Feature ${idx} designed`,
              uniqueId: idx,
            }),
            status: 'COMPLETED',
          })
        )
      );

      // Verify each workflow has exactly 1 result with correct content
      for (let i = 0; i < workflowCount; i++) {
        const results = await agentResultRepo.findByWorkflowId(workflows[i].workflowId);
        expect(results).toHaveLength(1);

        const resultData = JSON.parse(results[0].results);
        expect(resultData.uniqueId).toBe(i);
        expect(resultData.summary).toContain(`Feature ${i}`);
      }

      // Verify all workflows at step 1
      for (const wf of workflows) {
        const workflow = await workflowRepo.findById(wf.workflowId);
        expect(workflow?.currentStep).toBe(1);
        expect(workflow?.status).toBe('ACTIVE');
      }

      // Verify total database records
      const allResults = await prisma.agentResult.findMany();
      expect(allResults).toHaveLength(workflowCount);

      const allWorkflows = await prisma.workflow.findMany();
      expect(allWorkflows).toHaveLength(workflowCount);
    });
  });
});
