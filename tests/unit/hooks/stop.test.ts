/**
 * Stop Hook Handler Tests
 *
 * WBS Task: 6.1 Hook Adapters
 * Tests the Stop hook handler that cleans up orphaned workflows
 * when Claude Code sessions terminate.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleStop } from '../../../src/hooks/stop';
import { StateManager } from '../../../src/services/state-manager';
import { PrismaClient } from '@prisma/client';
import { WorkflowRepository } from '../../../src/models/workflow-repository';
import { TransitionRepository } from '../../../src/models/transition-repository';
import { ChainName } from '../../../src/types/workflow';

const prisma = new PrismaClient();

describe('Stop Hook Handler', () => {
  let stateManager: StateManager;
  let workflowRepo: WorkflowRepository;

  beforeEach(async () => {
    // Clean up database
    await prisma.agentResult.deleteMany();
    await prisma.workflowTransition.deleteMany();
    await prisma.workflow.deleteMany();

    // Initialize repositories and services
    workflowRepo = new WorkflowRepository(prisma);
    const transitionRepo = new TransitionRepository(prisma);

    stateManager = new StateManager(workflowRepo, transitionRepo);
  });

  describe('Active workflow cleanup', () => {
    it('should mark active workflow for session as FAILED', async () => {
      // Create workflows with different sessions
      const workflow1 = await stateManager.createWorkflow({
        userPrompt: 'Task 1',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: 'moderate',
        sessionId: 'test-session-1',
      });

      const workflow2 = await stateManager.createWorkflow({
        userPrompt: 'Task 2',
        chainName: ChainName.FRONTEND_DEVELOPMENT,
        complexity: 'simple',
        sessionId: 'test-session-2',
      });

      const workflow3 = await stateManager.createWorkflow({
        userPrompt: 'Task 3',
        chainName: ChainName.REVIEW_ONLY,
        complexity: 'simple',
        sessionId: 'test-session-3',
      });

      // Call stop handler for session 2 only
      await handleStop({ session_id: 'test-session-2', cwd: '/test' }, workflowRepo);

      // Verify only workflow2 is marked as FAILED
      const updatedWorkflow1 = await stateManager.getWorkflow(workflow1.id);
      const updatedWorkflow2 = await stateManager.getWorkflow(workflow2.id);
      const updatedWorkflow3 = await stateManager.getWorkflow(workflow3.id);

      expect(updatedWorkflow1?.status).toBe('ACTIVE'); // Not affected
      expect(updatedWorkflow2?.status).toBe('FAILED'); // Only this one
      expect(updatedWorkflow3?.status).toBe('ACTIVE'); // Not affected
    });

    it('should not fail workflows that are already completed', async () => {
      // Create workflow and complete it
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Completed task',
        chainName: ChainName.REVIEW_ONLY,
        complexity: 'simple',
        sessionId: 'test-session-completed',
      });

      await stateManager.completeWorkflow(workflow.id, 'Task done');

      // Call stop handler
      await handleStop({ session_id: 'test-session-completed', cwd: '/test' }, workflowRepo);

      // Verify workflow is still COMPLETED
      const updatedWorkflow = await stateManager.getWorkflow(workflow.id);
      expect(updatedWorkflow?.status).toBe('COMPLETED');
    });

    it('should not fail workflows that are already failed', async () => {
      // Create workflow and fail it
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Failed task',
        chainName: ChainName.BACKEND_DEVELOPMENT,
        complexity: 'moderate',
        sessionId: 'test-session-failed',
      });

      await stateManager.failWorkflow(workflow.id, 'Agent error');

      // Call stop handler
      await handleStop({ session_id: 'test-session-failed', cwd: '/test' }, workflowRepo);

      // Verify workflow is still FAILED
      const updatedWorkflow = await stateManager.getWorkflow(workflow.id);
      expect(updatedWorkflow?.status).toBe('FAILED');
    });
  });

  describe('No active workflows', () => {
    it('should skip when no active workflow for session', async () => {
      // Call stop handler with empty database
      await handleStop({ session_id: 'test-session-nonexistent', cwd: '/test' }, workflowRepo);

      // Verify no workflows exist
      const workflows = await prisma.workflow.findMany();
      expect(workflows).toHaveLength(0);
    });

    it('should not affect completed workflows when no active workflows exist', async () => {
      // Create and complete workflow
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Done task',
        chainName: ChainName.REVIEW_ONLY,
        complexity: 'simple',
        sessionId: 'test-session-no-active',
      });

      await stateManager.completeWorkflow(workflow.id, 'Success');

      // Call stop handler
      await handleStop({ session_id: 'test-session-no-active', cwd: '/test' }, workflowRepo);

      // Verify workflow unchanged
      const updatedWorkflow = await stateManager.getWorkflow(workflow.id);
      expect(updatedWorkflow?.status).toBe('COMPLETED');
    });
  });

  describe('Multiple orphaned workflows', () => {
    it('should clean up orphaned workflow for specific session', async () => {
      // Create multiple workflows with different sessions
      const sessionAWorkflows: string[] = [];
      const sessionBWorkflows: string[] = [];

      for (let i = 0; i < 5; i++) {
        const workflowA = await stateManager.createWorkflow({
          userPrompt: `Task A${i}`,
          chainName: ChainName.BACKEND_DEVELOPMENT,
          complexity: 'moderate',
          sessionId: 'test-session-A',
        });
        sessionAWorkflows.push(workflowA.id);

        const workflowB = await stateManager.createWorkflow({
          userPrompt: `Task B${i}`,
          chainName: ChainName.FRONTEND_DEVELOPMENT,
          complexity: 'simple',
          sessionId: 'test-session-B',
        });
        sessionBWorkflows.push(workflowB.id);
      }

      // Call stop handler for session A only
      await handleStop({ session_id: 'test-session-A', cwd: '/test' }, workflowRepo);

      // Verify only session A workflow is failed (the most recent one)
      for (const id of sessionAWorkflows) {
        const workflow = await stateManager.getWorkflow(id);
        // Only the last workflow (active one) should be failed
        if (id === sessionAWorkflows[sessionAWorkflows.length - 1]) {
          expect(workflow?.status).toBe('FAILED');
        }
      }

      // Verify session B workflows remain active
      for (const id of sessionBWorkflows) {
        const workflow = await stateManager.getWorkflow(id);
        expect(workflow?.status).toBe('ACTIVE');
      }
    });
  });
});
