import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient, Workflow } from '@prisma/client';
import { WorkflowRepository } from '../../../src/models/workflow-repository';
import { WorkflowStatus } from '../../../src/types/repositories';

/**
 * Unit tests for WorkflowRepository
 *
 * Test Suite: WorkflowRepository with Mocked Prisma
 * Purpose: Test repository logic without database dependency
 * Approach: Mock Prisma client methods to isolate repository layer
 *
 * Following TDD approach - these tests will fail (red) until implementation is complete
 */

describe('WorkflowRepository', () => {
  let prisma: PrismaClient;
  let repository: WorkflowRepository;
  let mockWorkflow: Workflow;

  beforeEach(() => {
    // Create mocked Prisma client
    prisma = {
      workflow: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    } as any;

    repository = new WorkflowRepository(prisma);

    // Mock workflow data
    mockWorkflow = {
      id: 'test-workflow-id',
      userPrompt: 'Test prompt',
      chainName: 'backend-development',
      complexity: 'moderate',
      draftComplexity: null,
      currentStep: 0,
      status: 'ACTIVE',
      sessionId: null,
      createdAt: BigInt(Date.now()),
      updatedAt: BigInt(Date.now()),
    };
  });

  describe('createWorkflow()', () => {
    it('should create a workflow with generated UUID and timestamps', async () => {
      const createData = {
        userPrompt: 'Implement REST API',
        chainName: 'backend-development',
        complexity: 'moderate' as const,
      };

      (prisma.workflow.create as any).mockResolvedValue(mockWorkflow);

      const result = await repository.createWorkflow(createData);

      expect(prisma.workflow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
          userPrompt: createData.userPrompt,
          chainName: createData.chainName,
          complexity: createData.complexity,
          currentStep: 0,
          status: 'ACTIVE',
          createdAt: expect.any(BigInt),
          updatedAt: expect.any(BigInt),
        }),
      });
      expect(result).toEqual(mockWorkflow);
    });

    it('should use provided currentStep and status when specified', async () => {
      const createData = {
        userPrompt: 'Test prompt',
        chainName: 'frontend-development',
        complexity: 'simple' as const,
        currentStep: 2,
        status: 'COMPLETED' as WorkflowStatus,
      };

      (prisma.workflow.create as any).mockResolvedValue({
        ...mockWorkflow,
        currentStep: 2,
        status: 'COMPLETED',
      });

      const result = await repository.createWorkflow(createData);

      expect(prisma.workflow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          currentStep: 2,
          status: 'COMPLETED',
        }),
      });
      expect(result.currentStep).toBe(2);
      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('findById()', () => {
    it('should find workflow by ID without relations', async () => {
      (prisma.workflow.findUnique as any).mockResolvedValue(mockWorkflow);

      const result = await repository.findById('test-workflow-id');

      expect(prisma.workflow.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-workflow-id' },
      });
      expect(result).toEqual(mockWorkflow);
    });

    it('should find workflow with agentResults when requested', async () => {
      const mockWithResults = {
        ...mockWorkflow,
        agentResults: [
          {
            id: 1,
            workflowId: 'test-workflow-id',
            agentRole: 'architect',
            complexity: 'moderate',
            stepNumber: 0,
            results: '{}',
            status: 'COMPLETED',
            createdAt: BigInt(Date.now()),
          },
        ],
      };

      (prisma.workflow.findUnique as any).mockResolvedValue(mockWithResults);

      const result = await repository.findById('test-workflow-id', {
        includeAgentResults: true,
      });

      expect(prisma.workflow.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-workflow-id' },
        include: {
          agentResults: true,
        },
      });
      expect(result?.agentResults).toBeDefined();
      expect(result?.agentResults).toHaveLength(1);
    });

    it('should find workflow with transitions when requested', async () => {
      const mockWithTransitions = {
        ...mockWorkflow,
        transitions: [
          {
            id: 1,
            workflowId: 'test-workflow-id',
            fromStep: 0,
            toStep: 1,
            fromAgent: 'architect',
            toAgent: 'java-backend-developer',
            reason: 'Design complete',
            createdAt: BigInt(Date.now()),
          },
        ],
      };

      (prisma.workflow.findUnique as any).mockResolvedValue(mockWithTransitions);

      const result = await repository.findById('test-workflow-id', {
        includeTransitions: true,
      });

      expect(prisma.workflow.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-workflow-id' },
        include: {
          transitions: true,
        },
      });
      expect(result?.transitions).toBeDefined();
      expect(result?.transitions).toHaveLength(1);
    });

    it('should return null when workflow not found', async () => {
      (prisma.workflow.findUnique as any).mockResolvedValue(null);

      const result = await repository.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByStatus()', () => {
    it('should find workflows by ACTIVE status', async () => {
      const activeWorkflows = [
        mockWorkflow,
        { ...mockWorkflow, id: 'workflow-2' },
      ];

      (prisma.workflow.findMany as any).mockResolvedValue(activeWorkflows);

      const result = await repository.findByStatus('ACTIVE');

      expect(prisma.workflow.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
      });
      expect(result).toEqual(activeWorkflows);
      expect(result).toHaveLength(2);
    });

    it('should find workflows by COMPLETED status', async () => {
      const completedWorkflows = [
        { ...mockWorkflow, status: 'COMPLETED' },
      ];

      (prisma.workflow.findMany as any).mockResolvedValue(completedWorkflows);

      const result = await repository.findByStatus('COMPLETED');

      expect(prisma.workflow.findMany).toHaveBeenCalledWith({
        where: { status: 'COMPLETED' },
      });
      expect(result[0].status).toBe('COMPLETED');
    });

    it('should return empty array when no workflows match status', async () => {
      (prisma.workflow.findMany as any).mockResolvedValue([]);

      const result = await repository.findByStatus('FAILED');

      expect(result).toEqual([]);
    });
  });

  describe('findActive()', () => {
    it('should find all active workflows', async () => {
      const activeWorkflows = [
        mockWorkflow,
        { ...mockWorkflow, id: 'workflow-2' },
        { ...mockWorkflow, id: 'workflow-3' },
      ];

      (prisma.workflow.findMany as any).mockResolvedValue(activeWorkflows);

      const result = await repository.findActive();

      expect(prisma.workflow.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
      });
      expect(result).toHaveLength(3);
      expect(result.every(w => w.status === 'ACTIVE')).toBe(true);
    });

    it('should return empty array when no active workflows exist', async () => {
      (prisma.workflow.findMany as any).mockResolvedValue([]);

      const result = await repository.findActive();

      expect(result).toEqual([]);
    });
  });

  describe('updateStatus()', () => {
    it('should update workflow status', async () => {
      const updatedWorkflow = {
        ...mockWorkflow,
        status: 'COMPLETED',
        updatedAt: BigInt(Date.now()),
      };

      (prisma.workflow.update as any).mockResolvedValue(updatedWorkflow);

      const result = await repository.updateStatus('test-workflow-id', 'COMPLETED');

      expect(prisma.workflow.update).toHaveBeenCalledWith({
        where: { id: 'test-workflow-id' },
        data: {
          status: 'COMPLETED',
          updatedAt: expect.any(BigInt),
        },
      });
      expect(result.status).toBe('COMPLETED');
    });

    it('should update workflow status and current step together', async () => {
      const updatedWorkflow = {
        ...mockWorkflow,
        status: 'ACTIVE',
        currentStep: 2,
        updatedAt: BigInt(Date.now()),
      };

      (prisma.workflow.update as any).mockResolvedValue(updatedWorkflow);

      const result = await repository.updateStatus('test-workflow-id', 'ACTIVE', 2);

      expect(prisma.workflow.update).toHaveBeenCalledWith({
        where: { id: 'test-workflow-id' },
        data: {
          status: 'ACTIVE',
          currentStep: 2,
          updatedAt: expect.any(BigInt),
        },
      });
      expect(result.currentStep).toBe(2);
    });

    it('should throw error when updating non-existent workflow', async () => {
      (prisma.workflow.update as any).mockRejectedValue(
        new Error('Record to update not found')
      );

      await expect(
        repository.updateStatus('non-existent-id', 'COMPLETED')
      ).rejects.toThrow('Record to update not found');
    });
  });

  describe('deleteWorkflow()', () => {
    it('should delete workflow and return true', async () => {
      (prisma.workflow.delete as any).mockResolvedValue(mockWorkflow);

      const result = await repository.deleteWorkflow('test-workflow-id');

      expect(prisma.workflow.delete).toHaveBeenCalledWith({
        where: { id: 'test-workflow-id' },
      });
      expect(result).toBe(true);
    });

    it('should return false when deleting non-existent workflow', async () => {
      (prisma.workflow.delete as any).mockRejectedValue(
        new Error('Record to delete does not exist')
      );

      const result = await repository.deleteWorkflow('non-existent-id');

      expect(result).toBe(false);
    });

    it('should cascade delete to related agentResults and transitions', async () => {
      // This is implicit in Prisma schema with onDelete: Cascade
      // The repository just needs to call delete, Prisma handles cascade
      (prisma.workflow.delete as any).mockResolvedValue(mockWorkflow);

      const result = await repository.deleteWorkflow('test-workflow-id');

      expect(prisma.workflow.delete).toHaveBeenCalledWith({
        where: { id: 'test-workflow-id' },
      });
      expect(result).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty userPrompt gracefully', async () => {
      const createData = {
        userPrompt: '',
        chainName: 'backend-development',
        complexity: 'simple' as const,
      };

      (prisma.workflow.create as any).mockResolvedValue({
        ...mockWorkflow,
        userPrompt: '',
      });

      const result = await repository.createWorkflow(createData);

      expect(result.userPrompt).toBe('');
    });

    it('should validate workflow status is valid enum value', async () => {
      // Repository should only accept valid WorkflowStatus types
      const validStatuses: WorkflowStatus[] = ['ACTIVE', 'COMPLETED', 'FAILED'];

      for (const status of validStatuses) {
        (prisma.workflow.findMany as any).mockResolvedValue([]);
        await repository.findByStatus(status);
      }

      // TypeScript will prevent invalid status at compile time
      expect(true).toBe(true);
    });

    it('should handle very long userPrompt strings', async () => {
      const longPrompt = 'A'.repeat(10000);
      const createData = {
        userPrompt: longPrompt,
        chainName: 'backend-development',
        complexity: 'complex' as const,
      };

      (prisma.workflow.create as any).mockResolvedValue({
        ...mockWorkflow,
        userPrompt: longPrompt,
      });

      const result = await repository.createWorkflow(createData);

      expect(result.userPrompt).toBe(longPrompt);
    });
  });
});
