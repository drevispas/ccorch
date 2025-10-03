import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { WorkflowTransitionModel } from '../../../src/models/workflow-transition';
import { WorkflowModel } from '../../../src/models/workflow';

/**
 * Unit tests for WorkflowTransition model
 *
 * Test Suite: WorkflowTransition Model (Audit Log) Operations
 * Purpose: Validate transition creation, retrieval, and audit trail functionality
 * Database: In-memory SQLite for test isolation
 *
 * WorkflowTransition tracks state changes: from_step → to_step with reason and agent info
 * Critical for debugging workflow execution and understanding agent handoffs
 *
 * Following TDD approach - these tests will fail (red) until implementation is complete
 */

describe('WorkflowTransition Model', () => {
  let prisma: PrismaClient;
  let transitionModel: WorkflowTransitionModel;
  let workflowModel: WorkflowModel;
  let testWorkflowId: string;

  beforeEach(async () => {
    // Initialize Prisma with in-memory SQLite database
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: 'file::memory:?cache=shared'
        }
      }
    });

    // Run migrations to set up schema
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');

    transitionModel = new WorkflowTransitionModel(prisma);
    workflowModel = new WorkflowModel(prisma);

    // Create a test workflow for foreign key relationships
    const workflow = await workflowModel.createWorkflow({
      userPrompt: 'Test workflow for transitions',
      chainName: 'backend-development',
      complexity: 'moderate',
      currentStep: 0,
      status: 'ACTIVE'
    });
    testWorkflowId = workflow.id;
  });

  afterEach(async () => {
    // Clean up database connections
    await prisma.$disconnect();
  });

  describe('createTransition()', () => {
    it('should create a transition with all required fields', async () => {
      const transitionData = {
        workflowId: testWorkflowId,
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'backend-developer',
        reason: 'Architecture design completed successfully'
      };

      const transition = await transitionModel.createTransition(transitionData);

      expect(transition).toBeDefined();
      expect(transition.id).toBeGreaterThan(0);
      expect(transition.workflowId).toBe(testWorkflowId);
      expect(transition.fromStep).toBe(0);
      expect(transition.toStep).toBe(1);
      expect(transition.fromAgent).toBe('architect');
      expect(transition.toAgent).toBe('backend-developer');
      expect(transition.reason).toBe('Architecture design completed successfully');
      expect(transition.createdAt).toBeGreaterThan(0);
    });

    it('should auto-increment ID for multiple transitions', async () => {
      const transition1 = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'backend-developer',
        reason: 'First transition'
      });

      const transition2 = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 1,
        toStep: 2,
        fromAgent: 'backend-developer',
        toAgent: 'reviewer',
        reason: 'Second transition'
      });

      expect(transition2.id).toBeGreaterThan(transition1.id);
    });

    it('should set default reason when not specified', async () => {
      const transition = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'backend-developer'
      });

      expect(transition.reason).toBe('Agent completed successfully');
    });

    it('should allow null fromAgent for initial transition', async () => {
      const transition = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 0,
        toStep: 0,
        fromAgent: null,
        toAgent: 'architect',
        reason: 'Workflow started'
      });

      expect(transition.fromAgent).toBeNull();
      expect(transition.toAgent).toBe('architect');
    });

    it('should allow null toAgent for terminal transition', async () => {
      const transition = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 2,
        toStep: 3,
        fromAgent: 'reviewer',
        toAgent: null,
        reason: 'Workflow completed'
      });

      expect(transition.fromAgent).toBe('reviewer');
      expect(transition.toAgent).toBeNull();
    });

    it('should record transitions for different workflows independently', async () => {
      // Create another workflow
      const otherWorkflow = await workflowModel.createWorkflow({
        userPrompt: 'Other workflow',
        chainName: 'frontend-development',
        complexity: 'simple',
        currentStep: 0,
        status: 'ACTIVE'
      });

      const transition1 = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'backend-developer',
        reason: 'Workflow 1 transition'
      });

      const transition2 = await transitionModel.createTransition({
        workflowId: otherWorkflow.id,
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'frontend-developer',
        reason: 'Workflow 2 transition'
      });

      expect(transition1.workflowId).toBe(testWorkflowId);
      expect(transition2.workflowId).toBe(otherWorkflow.id);
    });

    it('should record backward transitions for retry scenarios', async () => {
      const transition = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 2,
        toStep: 1,
        fromAgent: 'reviewer',
        toAgent: 'backend-developer',
        reason: 'Issues found, returning to developer'
      });

      expect(transition.fromStep).toBeGreaterThan(transition.toStep);
      expect(transition.reason).toContain('Issues found');
    });

    it('should record same-step transitions for state changes', async () => {
      const transition = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 1,
        toStep: 1,
        fromAgent: 'backend-developer',
        toAgent: 'backend-developer',
        reason: 'Switching complexity from simple to moderate'
      });

      expect(transition.fromStep).toBe(transition.toStep);
    });
  });

  describe('findByWorkflowId()', () => {
    it('should find all transitions for a given workflow', async () => {
      // Create multiple transitions for the test workflow
      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'backend-developer',
        reason: 'Architecture complete'
      });

      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 1,
        toStep: 2,
        fromAgent: 'backend-developer',
        toAgent: 'reviewer',
        reason: 'Implementation complete'
      });

      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 2,
        toStep: 3,
        fromAgent: 'reviewer',
        toAgent: null,
        reason: 'Review complete'
      });

      const transitions = await transitionModel.findByWorkflowId(testWorkflowId);

      expect(transitions).toHaveLength(3);
      expect(transitions.every(t => t.workflowId === testWorkflowId)).toBe(true);
    });

    it('should return transitions ordered by createdAt (chronological)', async () => {
      // Create transitions with slight delays to ensure different timestamps
      const t1 = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'backend-developer',
        reason: 'First'
      });

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const t2 = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 1,
        toStep: 2,
        fromAgent: 'backend-developer',
        toAgent: 'reviewer',
        reason: 'Second'
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const t3 = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 2,
        toStep: 3,
        fromAgent: 'reviewer',
        toAgent: null,
        reason: 'Third'
      });

      const transitions = await transitionModel.findByWorkflowId(testWorkflowId);

      expect(transitions[0].createdAt).toBeLessThanOrEqual(transitions[1].createdAt);
      expect(transitions[1].createdAt).toBeLessThanOrEqual(transitions[2].createdAt);
      expect(transitions[0].reason).toBe('First');
      expect(transitions[2].reason).toBe('Third');
    });

    it('should return empty array for workflow with no transitions', async () => {
      // Create a new workflow with no transitions
      const newWorkflow = await workflowModel.createWorkflow({
        userPrompt: 'Empty workflow',
        chainName: 'review',
        complexity: 'simple',
        currentStep: 0,
        status: 'ACTIVE'
      });

      const transitions = await transitionModel.findByWorkflowId(newWorkflow.id);

      expect(transitions).toEqual([]);
    });

    it('should return empty array for non-existent workflow ID', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';
      const transitions = await transitionModel.findByWorkflowId(nonExistentId);

      expect(transitions).toEqual([]);
    });

    it('should not return transitions from other workflows', async () => {
      // Create another workflow
      const otherWorkflow = await workflowModel.createWorkflow({
        userPrompt: 'Other workflow',
        chainName: 'debug',
        complexity: 'complex',
        currentStep: 0,
        status: 'ACTIVE'
      });

      // Create transition for other workflow
      await transitionModel.createTransition({
        workflowId: otherWorkflow.id,
        fromStep: 0,
        toStep: 1,
        fromAgent: 'debugger',
        toAgent: 'backend-developer',
        reason: 'Other workflow transition'
      });

      // Create transition for test workflow
      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'backend-developer',
        reason: 'Test workflow transition'
      });

      const transitions = await transitionModel.findByWorkflowId(testWorkflowId);

      expect(transitions).toHaveLength(1);
      expect(transitions[0].workflowId).toBe(testWorkflowId);
      expect(transitions[0].reason).toBe('Test workflow transition');
    });
  });

  describe('audit trail functionality', () => {
    it('should capture complete agent handoff information', async () => {
      const transition = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'backend-developer',
        reason: 'Design approved, ready for implementation'
      });

      // Verify audit fields are complete
      expect(transition.fromStep).toBe(0);
      expect(transition.toStep).toBe(1);
      expect(transition.fromAgent).toBe('architect');
      expect(transition.toAgent).toBe('backend-developer');
      expect(transition.reason).toBeTruthy();
      expect(transition.createdAt).toBeGreaterThan(0);
    });

    it('should track workflow failure transitions', async () => {
      const transition = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 1,
        toStep: 1,
        fromAgent: 'backend-developer',
        toAgent: null,
        reason: 'Build failed: compilation errors in auth module'
      });

      expect(transition.toAgent).toBeNull();
      expect(transition.reason).toContain('failed');
    });

    it('should track manual admin transitions', async () => {
      const transition = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 2,
        toStep: 1,
        fromAgent: 'reviewer',
        toAgent: 'backend-developer',
        reason: 'Manual transition: Admin override due to critical bug'
      });

      expect(transition.fromStep).toBeGreaterThan(transition.toStep);
      expect(transition.reason).toContain('Manual transition');
    });

    it('should create complete audit trail for multi-step workflow', async () => {
      // Simulate a complete workflow lifecycle
      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 0,
        toStep: 1,
        fromAgent: null,
        toAgent: 'architect',
        reason: 'Workflow started'
      });

      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 1,
        toStep: 2,
        fromAgent: 'architect',
        toAgent: 'backend-developer',
        reason: 'Architecture approved'
      });

      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 2,
        toStep: 3,
        fromAgent: 'backend-developer',
        toAgent: 'reviewer',
        reason: 'Implementation complete'
      });

      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 3,
        toStep: 2,
        fromAgent: 'reviewer',
        toAgent: 'backend-developer',
        reason: 'Issues found in error handling'
      });

      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 2,
        toStep: 3,
        fromAgent: 'backend-developer',
        toAgent: 'reviewer',
        reason: 'Issues fixed, ready for re-review'
      });

      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 3,
        toStep: 4,
        fromAgent: 'reviewer',
        toAgent: null,
        reason: 'Workflow completed successfully'
      });

      const auditTrail = await transitionModel.findByWorkflowId(testWorkflowId);

      expect(auditTrail).toHaveLength(6);

      // Verify chronological order
      expect(auditTrail[0].toAgent).toBe('architect');
      expect(auditTrail[5].toAgent).toBeNull();

      // Verify we captured the retry
      const retryTransition = auditTrail.find(t => t.reason.includes('Issues found'));
      expect(retryTransition).toBeDefined();
      expect(retryTransition?.fromStep).toBeGreaterThan(retryTransition?.toStep || 0);
    });

    it('should preserve reason text for debugging', async () => {
      const detailedReason = 'Agent completed with warnings: TypeScript strict mode disabled in 3 files, consider enabling for better type safety';

      const transition = await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 1,
        toStep: 2,
        fromAgent: 'backend-developer',
        toAgent: 'reviewer',
        reason: detailedReason
      });

      expect(transition.reason).toBe(detailedReason);
      expect(transition.reason.length).toBeGreaterThan(50); // Ensures we store detailed reasons
    });
  });

  describe('cascade delete when workflow deleted', () => {
    it('should delete all transitions when workflow is deleted', async () => {
      // Create multiple transitions for the workflow
      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'backend-developer',
        reason: 'Transition 1'
      });

      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 1,
        toStep: 2,
        fromAgent: 'backend-developer',
        toAgent: 'reviewer',
        reason: 'Transition 2'
      });

      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 2,
        toStep: 3,
        fromAgent: 'reviewer',
        toAgent: null,
        reason: 'Transition 3'
      });

      // Verify transitions exist
      let transitions = await transitionModel.findByWorkflowId(testWorkflowId);
      expect(transitions).toHaveLength(3);

      // Delete the workflow
      await workflowModel.deleteWorkflow(testWorkflowId);

      // Verify all transitions are deleted
      transitions = await transitionModel.findByWorkflowId(testWorkflowId);
      expect(transitions).toEqual([]);
    });

    it('should only delete transitions for the deleted workflow', async () => {
      // Create another workflow
      const otherWorkflow = await workflowModel.createWorkflow({
        userPrompt: 'Other workflow',
        chainName: 'frontend-development',
        complexity: 'simple',
        currentStep: 0,
        status: 'ACTIVE'
      });

      // Create transitions for both workflows
      await transitionModel.createTransition({
        workflowId: testWorkflowId,
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'backend-developer',
        reason: 'Test workflow transition'
      });

      await transitionModel.createTransition({
        workflowId: otherWorkflow.id,
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'frontend-developer',
        reason: 'Other workflow transition'
      });

      // Delete the test workflow
      await workflowModel.deleteWorkflow(testWorkflowId);

      // Verify test workflow transitions are deleted
      const testTransitions = await transitionModel.findByWorkflowId(testWorkflowId);
      expect(testTransitions).toEqual([]);

      // Verify other workflow transitions still exist
      const otherTransitions = await transitionModel.findByWorkflowId(otherWorkflow.id);
      expect(otherTransitions).toHaveLength(1);
      expect(otherTransitions[0].workflowId).toBe(otherWorkflow.id);
    });

    it('should handle cascade delete with no transitions gracefully', async () => {
      // Create a workflow with no transitions
      const emptyWorkflow = await workflowModel.createWorkflow({
        userPrompt: 'Empty workflow',
        chainName: 'review',
        complexity: 'simple',
        currentStep: 0,
        status: 'ACTIVE'
      });

      // Delete should succeed even with no transitions
      await expect(
        workflowModel.deleteWorkflow(emptyWorkflow.id)
      ).resolves.toBe(true);

      const workflow = await workflowModel.findById(emptyWorkflow.id);
      expect(workflow).toBeNull();
    });
  });
});
