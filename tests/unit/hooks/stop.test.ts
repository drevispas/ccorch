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
    it('should mark all active workflows as FAILED', async () => {
      // Create 3 active workflows
      const workflow1 = await stateManager.createWorkflow({
        userPrompt: 'Task 1',
        chainName: 'backend-development',
        complexity: 'moderate',
        draftComplexity: undefined,
      });

      const workflow2 = await stateManager.createWorkflow({
        userPrompt: 'Task 2',
        chainName: 'frontend-development',
        complexity: 'simple',
        draftComplexity: undefined,
      });

      const workflow3 = await stateManager.createWorkflow({
        userPrompt: 'Task 3',
        chainName: 'review-only',
        complexity: 'simple',
        draftComplexity: undefined,
      });

      // Call stop handler
      await handleStop(workflowRepo);

      // Verify all workflows are marked as FAILED
      const updatedWorkflow1 = await stateManager.getWorkflow(workflow1.id);
      const updatedWorkflow2 = await stateManager.getWorkflow(workflow2.id);
      const updatedWorkflow3 = await stateManager.getWorkflow(workflow3.id);

      expect(updatedWorkflow1?.status).toBe('FAILED');
      expect(updatedWorkflow2?.status).toBe('FAILED');
      expect(updatedWorkflow3?.status).toBe('FAILED');
    });

    it('should not fail workflows that are already completed', async () => {
      // Create workflow and complete it
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Completed task',
        chainName: 'review-only',
        complexity: 'simple',
        draftComplexity: undefined,
      });

      await stateManager.completeWorkflow(workflow.id, 'Task done');

      // Call stop handler
      await handleStop(workflowRepo);

      // Verify workflow is still COMPLETED
      const updatedWorkflow = await stateManager.getWorkflow(workflow.id);
      expect(updatedWorkflow?.status).toBe('COMPLETED');
    });

    it('should not fail workflows that are already failed', async () => {
      // Create workflow and fail it
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Failed task',
        chainName: 'backend-development',
        complexity: 'moderate',
        draftComplexity: undefined,
      });

      await stateManager.failWorkflow(workflow.id, 'Agent error');

      // Call stop handler
      await handleStop(workflowRepo);

      // Verify workflow is still FAILED
      const updatedWorkflow = await stateManager.getWorkflow(workflow.id);
      expect(updatedWorkflow?.status).toBe('FAILED');
    });
  });

  describe('No active workflows', () => {
    it('should do nothing when no active workflows exist', async () => {
      // Call stop handler with empty database
      await handleStop(stateManager);

      // Verify no workflows exist
      const workflows = await prisma.workflow.findMany();
      expect(workflows).toHaveLength(0);
    });

    it('should not affect completed workflows when no active workflows exist', async () => {
      // Create and complete workflow
      const workflow = await stateManager.createWorkflow({
        userPrompt: 'Done task',
        chainName: 'review-only',
        complexity: 'simple',
        draftComplexity: undefined,
      });

      await stateManager.completeWorkflow(workflow.id, 'Success');

      // Call stop handler
      await handleStop(workflowRepo);

      // Verify workflow unchanged
      const updatedWorkflow = await stateManager.getWorkflow(workflow.id);
      expect(updatedWorkflow?.status).toBe('COMPLETED');
    });
  });

  describe('Multiple orphaned workflows', () => {
    it('should clean up all orphaned workflows', async () => {
      // Create 10 active workflows (simulating multiple abandoned tasks)
      const workflowIds: string[] = [];

      for (let i = 0; i < 10; i++) {
        const workflow = await stateManager.createWorkflow({
          userPrompt: `Task ${i}`,
          chainName: 'backend-development',
          complexity: 'moderate',
          draftComplexity: undefined,
        });
        workflowIds.push(workflow.id);
      }

      // Call stop handler
      await handleStop(workflowRepo);

      // Verify all workflows are failed
      for (const id of workflowIds) {
        const workflow = await stateManager.getWorkflow(id);
        expect(workflow?.status).toBe('FAILED');
      }
    });
  });
});
