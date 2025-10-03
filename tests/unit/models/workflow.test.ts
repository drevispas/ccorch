import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { WorkflowModel } from '../../../src/models/workflow';

/**
 * Unit tests for Workflow model
 *
 * Test Suite: Workflow Model CRUD Operations
 * Purpose: Validate workflow creation, retrieval, status updates, and cascading deletes
 * Database: In-memory SQLite for test isolation
 *
 * Following TDD approach - these tests will fail (red) until implementation is complete
 */

describe('Workflow Model', () => {
  let prisma: PrismaClient;
  let workflowModel: WorkflowModel;

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

    workflowModel = new WorkflowModel(prisma);
  });

  afterEach(async () => {
    // Clean up database connections
    await prisma.$disconnect();
  });

  describe('createWorkflow()', () => {
    it('should create a workflow with all required fields', async () => {
      const workflowData = {
        userPrompt: 'Implement REST API for authentication',
        chainName: 'backend-development',
        complexity: 'moderate' as const,
        currentStep: 0,
        status: 'ACTIVE' as const
      };

      const workflow = await workflowModel.createWorkflow(workflowData);

      expect(workflow).toBeDefined();
      expect(workflow.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i); // UUID v4
      expect(workflow.userPrompt).toBe(workflowData.userPrompt);
      expect(workflow.chainName).toBe(workflowData.chainName);
      expect(workflow.complexity).toBe(workflowData.complexity);
      expect(workflow.currentStep).toBe(0);
      expect(workflow.status).toBe('ACTIVE');
      expect(workflow.createdAt).toBeGreaterThan(0);
      expect(workflow.updatedAt).toBeGreaterThan(0);
    });

    it('should generate unique IDs for multiple workflows', async () => {
      const workflow1 = await workflowModel.createWorkflow({
        userPrompt: 'First task',
        chainName: 'backend-development',
        complexity: 'simple',
        currentStep: 0,
        status: 'ACTIVE'
      });

      const workflow2 = await workflowModel.createWorkflow({
        userPrompt: 'Second task',
        chainName: 'frontend-development',
        complexity: 'complex',
        currentStep: 0,
        status: 'ACTIVE'
      });

      expect(workflow1.id).not.toBe(workflow2.id);
    });

    it('should set default status to ACTIVE when not specified', async () => {
      const workflow = await workflowModel.createWorkflow({
        userPrompt: 'Test task',
        chainName: 'backend-development',
        complexity: 'moderate',
        currentStep: 0
      });

      expect(workflow.status).toBe('ACTIVE');
    });

    it('should set default currentStep to 0 when not specified', async () => {
      const workflow = await workflowModel.createWorkflow({
        userPrompt: 'Test task',
        chainName: 'backend-development',
        complexity: 'moderate'
      });

      expect(workflow.currentStep).toBe(0);
    });
  });

  describe('findById()', () => {
    it('should find workflow by valid ID', async () => {
      const created = await workflowModel.createWorkflow({
        userPrompt: 'Find me test',
        chainName: 'backend-development',
        complexity: 'simple',
        currentStep: 0,
        status: 'ACTIVE'
      });

      const found = await workflowModel.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.userPrompt).toBe('Find me test');
      expect(found?.chainName).toBe('backend-development');
    });

    it('should return null for non-existent ID', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';
      const found = await workflowModel.findById(nonExistentId);

      expect(found).toBeNull();
    });

    it('should include related agentResults when requested', async () => {
      const workflow = await workflowModel.createWorkflow({
        userPrompt: 'Test with results',
        chainName: 'backend-development',
        complexity: 'moderate',
        currentStep: 1,
        status: 'ACTIVE'
      });

      // Note: This assumes AgentResult model exists and has a create method
      // Will be implemented in subsequent tasks (3.2.3-3.2.4)
      const foundWithRelations = await workflowModel.findById(workflow.id, {
        includeAgentResults: true
      });

      expect(foundWithRelations).toBeDefined();
      expect(foundWithRelations?.agentResults).toBeDefined();
      expect(Array.isArray(foundWithRelations?.agentResults)).toBe(true);
    });
  });

  describe('findByStatus()', () => {
    it('should find all workflows with ACTIVE status', async () => {
      await workflowModel.createWorkflow({
        userPrompt: 'Active workflow 1',
        chainName: 'backend-development',
        complexity: 'simple',
        currentStep: 0,
        status: 'ACTIVE'
      });

      await workflowModel.createWorkflow({
        userPrompt: 'Active workflow 2',
        chainName: 'frontend-development',
        complexity: 'moderate',
        currentStep: 1,
        status: 'ACTIVE'
      });

      await workflowModel.createWorkflow({
        userPrompt: 'Completed workflow',
        chainName: 'review',
        complexity: 'simple',
        currentStep: 2,
        status: 'COMPLETED'
      });

      const activeWorkflows = await workflowModel.findByStatus('ACTIVE');

      expect(activeWorkflows).toHaveLength(2);
      expect(activeWorkflows.every(w => w.status === 'ACTIVE')).toBe(true);
    });

    it('should find all workflows with COMPLETED status', async () => {
      await workflowModel.createWorkflow({
        userPrompt: 'Completed 1',
        chainName: 'backend-development',
        complexity: 'simple',
        currentStep: 3,
        status: 'COMPLETED'
      });

      const completedWorkflows = await workflowModel.findByStatus('COMPLETED');

      expect(completedWorkflows.length).toBeGreaterThanOrEqual(1);
      expect(completedWorkflows.every(w => w.status === 'COMPLETED')).toBe(true);
    });

    it('should find all workflows with FAILED status', async () => {
      await workflowModel.createWorkflow({
        userPrompt: 'Failed workflow',
        chainName: 'debug',
        complexity: 'complex',
        currentStep: 1,
        status: 'FAILED'
      });

      const failedWorkflows = await workflowModel.findByStatus('FAILED');

      expect(failedWorkflows.length).toBeGreaterThanOrEqual(1);
      expect(failedWorkflows.every(w => w.status === 'FAILED')).toBe(true);
    });

    it('should return empty array when no workflows match status', async () => {
      const workflows = await workflowModel.findByStatus('FAILED');

      expect(workflows).toEqual([]);
    });
  });

  describe('updateStatus()', () => {
    it('should update workflow status from ACTIVE to COMPLETED', async () => {
      const workflow = await workflowModel.createWorkflow({
        userPrompt: 'Status update test',
        chainName: 'backend-development',
        complexity: 'moderate',
        currentStep: 2,
        status: 'ACTIVE'
      });

      const updated = await workflowModel.updateStatus(workflow.id, 'COMPLETED');

      expect(updated.status).toBe('COMPLETED');
      expect(updated.id).toBe(workflow.id);
      expect(updated.updatedAt).toBeGreaterThan(workflow.updatedAt);
    });

    it('should update workflow status from ACTIVE to FAILED', async () => {
      const workflow = await workflowModel.createWorkflow({
        userPrompt: 'Failure test',
        chainName: 'debug',
        complexity: 'simple',
        currentStep: 1,
        status: 'ACTIVE'
      });

      const updated = await workflowModel.updateStatus(workflow.id, 'FAILED');

      expect(updated.status).toBe('FAILED');
    });

    it('should update currentStep along with status', async () => {
      const workflow = await workflowModel.createWorkflow({
        userPrompt: 'Step update test',
        chainName: 'backend-development',
        complexity: 'complex',
        currentStep: 0,
        status: 'ACTIVE'
      });

      const updated = await workflowModel.updateStatus(workflow.id, 'ACTIVE', 2);

      expect(updated.currentStep).toBe(2);
      expect(updated.status).toBe('ACTIVE');
    });

    it('should throw error when updating non-existent workflow', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';

      await expect(
        workflowModel.updateStatus(nonExistentId, 'COMPLETED')
      ).rejects.toThrow();
    });
  });

  describe('cascade delete', () => {
    it('should delete workflow and cascade to related agentResults', async () => {
      const workflow = await workflowModel.createWorkflow({
        userPrompt: 'Cascade delete test',
        chainName: 'backend-development',
        complexity: 'moderate',
        currentStep: 1,
        status: 'ACTIVE'
      });

      // Note: This assumes AgentResult can be created
      // Will be fully testable after tasks 3.2.3-3.2.4

      await workflowModel.deleteWorkflow(workflow.id);

      const found = await workflowModel.findById(workflow.id);
      expect(found).toBeNull();
    });

    it('should delete workflow and cascade to related transitions', async () => {
      const workflow = await workflowModel.createWorkflow({
        userPrompt: 'Transition cascade test',
        chainName: 'frontend-development',
        complexity: 'simple',
        currentStep: 0,
        status: 'ACTIVE'
      });

      // Note: This assumes WorkflowTransition can be created
      // Will be fully testable after tasks 3.2.5-3.2.6

      await workflowModel.deleteWorkflow(workflow.id);

      const found = await workflowModel.findById(workflow.id);
      expect(found).toBeNull();
    });

    it('should handle deletion of workflow with multiple related records', async () => {
      const workflow = await workflowModel.createWorkflow({
        userPrompt: 'Multiple relations test',
        chainName: 'backend-development',
        complexity: 'complex',
        currentStep: 2,
        status: 'COMPLETED'
      });

      // In a real scenario, this workflow would have:
      // - Multiple AgentResults (one per step)
      // - Multiple WorkflowTransitions (state change audit log)
      // All should be deleted when workflow is deleted

      const deleted = await workflowModel.deleteWorkflow(workflow.id);

      expect(deleted).toBe(true);

      const found = await workflowModel.findById(workflow.id);
      expect(found).toBeNull();
    });
  });
});
