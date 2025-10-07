import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient, WorkflowTransition } from '@prisma/client';
import { TransitionRepository } from '../../../src/models/transition-repository';

/**
 * Unit tests for TransitionRepository
 *
 * Test Suite: TransitionRepository with Mocked Prisma
 * Purpose: Test audit log repository for workflow state transitions
 * Key Feature: Records all workflow transitions with timestamps and reasons for accountability
 *
 * Following TDD approach - these tests will fail (red) until implementation is complete
 */

describe('TransitionRepository', () => {
  let prisma: PrismaClient;
  let repository: TransitionRepository;
  let mockTransition: WorkflowTransition;

  beforeEach(() => {
    // Create mocked Prisma client
    prisma = {
      workflowTransition: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    } as any;

    repository = new TransitionRepository(prisma);

    // Mock transition data
    mockTransition = {
      id: 1,
      workflowId: 'test-workflow-id',
      fromStep: 0,
      toStep: 1,
      fromAgent: 'architect',
      toAgent: 'java-backend-developer',
      reason: 'Architecture design completed successfully',
      createdAt: BigInt(Date.now()),
    };
  });

  describe('createTransition()', () => {
    it('should create transition with timestamp', async () => {
      const createData = {
        workflowId: 'test-workflow-id',
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'java-backend-developer',
        reason: 'Design approved',
      };

      (prisma.workflowTransition.create as any).mockResolvedValue(mockTransition);

      const result = await repository.createTransition(createData);

      expect(prisma.workflowTransition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workflowId: createData.workflowId,
          fromStep: createData.fromStep,
          toStep: createData.toStep,
          fromAgent: createData.fromAgent,
          toAgent: createData.toAgent,
          reason: createData.reason,
          createdAt: expect.any(BigInt),
        }),
      });
      expect(result).toEqual(mockTransition);
    });

    it('should use default reason when not provided', async () => {
      const createData = {
        workflowId: 'test-workflow-id',
        fromStep: 0,
        toStep: 1,
        fromAgent: 'architect',
        toAgent: 'java-backend-developer',
      };

      const defaultReasonTransition = {
        ...mockTransition,
        reason: 'Agent completed successfully',
      };

      (prisma.workflowTransition.create as any).mockResolvedValue(defaultReasonTransition);

      const result = await repository.createTransition(createData);

      expect(prisma.workflowTransition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reason: 'Agent completed successfully',
        }),
      });
      expect(result.reason).toBe('Agent completed successfully');
    });

    it('should handle null fromAgent for initial transition', async () => {
      const createData = {
        workflowId: 'test-workflow-id',
        fromStep: 0,
        toStep: 0,
        fromAgent: null,
        toAgent: 'architect',
        reason: 'Workflow started',
      };

      const initialTransition = {
        ...mockTransition,
        fromAgent: null,
        toAgent: 'architect',
      };

      (prisma.workflowTransition.create as any).mockResolvedValue(initialTransition);

      const result = await repository.createTransition(createData);

      expect(prisma.workflowTransition.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromAgent: null,
          toAgent: 'architect',
        }),
      });
      expect(result.fromAgent).toBeNull();
    });

    it('should handle null toAgent for terminal transition', async () => {
      const createData = {
        workflowId: 'test-workflow-id',
        fromStep: 3,
        toStep: 4,
        fromAgent: 'reviewer',
        toAgent: null,
        reason: 'Workflow completed',
      };

      const terminalTransition = {
        ...mockTransition,
        fromAgent: 'reviewer',
        toAgent: null,
      };

      (prisma.workflowTransition.create as any).mockResolvedValue(terminalTransition);

      const result = await repository.createTransition(createData);

      expect(result.toAgent).toBeNull();
    });

    it('should record backward transitions for retry scenarios', async () => {
      const createData = {
        workflowId: 'test-workflow-id',
        fromStep: 2,
        toStep: 1,
        fromAgent: 'reviewer',
        toAgent: 'java-backend-developer',
        reason: 'Issues found, returning to developer',
      };

      const backwardTransition = {
        ...mockTransition,
        fromStep: 2,
        toStep: 1,
      };

      (prisma.workflowTransition.create as any).mockResolvedValue(backwardTransition);

      const result = await repository.createTransition(createData);

      expect(result.fromStep).toBe(2);
      expect(result.toStep).toBe(1);
      expect(result.fromStep).toBeGreaterThan(result.toStep);
    });

    it('should record detailed reasons for audit trail', async () => {
      const detailedReason = 'Manual transition: Admin override due to critical bug in production. Skipping review step.';

      const createData = {
        workflowId: 'test-workflow-id',
        fromStep: 1,
        toStep: 3,
        fromAgent: 'java-backend-developer',
        toAgent: 'reviewer',
        reason: detailedReason,
      };

      (prisma.workflowTransition.create as any).mockResolvedValue({
        ...mockTransition,
        reason: detailedReason,
      });

      const result = await repository.createTransition(createData);

      expect(result.reason).toBe(detailedReason);
      expect(result.reason.length).toBeGreaterThan(50);
    });
  });

  describe('findByWorkflowId()', () => {
    it('should find all transitions for a workflow ordered by createdAt', async () => {
      const transitions = [
        { ...mockTransition, createdAt: BigInt(1000) },
        { ...mockTransition, id: 2, createdAt: BigInt(2000) },
        { ...mockTransition, id: 3, createdAt: BigInt(3000) },
      ];

      (prisma.workflowTransition.findMany as any).mockResolvedValue(transitions);

      const result = await repository.findByWorkflowId('test-workflow-id');

      expect(prisma.workflowTransition.findMany).toHaveBeenCalledWith({
        where: { workflowId: 'test-workflow-id' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual(transitions);
      expect(result).toHaveLength(3);
    });

    it('should return empty array when no transitions exist', async () => {
      (prisma.workflowTransition.findMany as any).mockResolvedValue([]);

      const result = await repository.findByWorkflowId('non-existent-workflow');

      expect(result).toEqual([]);
    });

    it('should return transitions in chronological order', async () => {
      const transitions = [
        { ...mockTransition, id: 1, createdAt: BigInt(1000), reason: 'First' },
        { ...mockTransition, id: 2, createdAt: BigInt(2000), reason: 'Second' },
        { ...mockTransition, id: 3, createdAt: BigInt(3000), reason: 'Third' },
      ];

      (prisma.workflowTransition.findMany as any).mockResolvedValue(transitions);

      const result = await repository.findByWorkflowId('test-workflow-id');

      expect(result[0].createdAt).toBeLessThan(result[1].createdAt);
      expect(result[1].createdAt).toBeLessThan(result[2].createdAt);
      expect(result[0].reason).toBe('First');
      expect(result[2].reason).toBe('Third');
    });

    it('should not return transitions from other workflows', async () => {
      const transitions = [mockTransition];

      (prisma.workflowTransition.findMany as any).mockResolvedValue(transitions);

      const result = await repository.findByWorkflowId('test-workflow-id');

      expect(result.every(t => t.workflowId === 'test-workflow-id')).toBe(true);
    });
  });

  describe('findLatest()', () => {
    it('should find the most recent transition for a workflow', async () => {
      const latestTransition = {
        ...mockTransition,
        id: 5,
        createdAt: BigInt(5000),
        reason: 'Latest transition',
      };

      (prisma.workflowTransition.findFirst as any).mockResolvedValue(latestTransition);

      const result = await repository.findLatest('test-workflow-id');

      expect(prisma.workflowTransition.findFirst).toHaveBeenCalledWith({
        where: { workflowId: 'test-workflow-id' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(latestTransition);
    });

    it('should return null when no transitions exist', async () => {
      (prisma.workflowTransition.findFirst as any).mockResolvedValue(null);

      const result = await repository.findLatest('non-existent-workflow');

      expect(result).toBeNull();
    });

    it('should return the latest transition even with multiple transitions', async () => {
      const latestTransition = {
        ...mockTransition,
        createdAt: BigInt(Date.now()),
        reason: 'Most recent',
      };

      (prisma.workflowTransition.findFirst as any).mockResolvedValue(latestTransition);

      const result = await repository.findLatest('test-workflow-id');

      expect(result?.reason).toBe('Most recent');
    });
  });

  describe('audit trail functionality', () => {
    it('should capture complete workflow lifecycle transitions', async () => {
      const lifecycleTransitions = [
        {
          ...mockTransition,
          id: 1,
          fromStep: 0,
          toStep: 1,
          fromAgent: null,
          toAgent: 'architect',
          reason: 'Workflow started',
          createdAt: BigInt(1000),
        },
        {
          ...mockTransition,
          id: 2,
          fromStep: 1,
          toStep: 2,
          fromAgent: 'architect',
          toAgent: 'java-backend-developer',
          reason: 'Design approved',
          createdAt: BigInt(2000),
        },
        {
          ...mockTransition,
          id: 3,
          fromStep: 2,
          toStep: 3,
          fromAgent: 'java-backend-developer',
          toAgent: 'reviewer',
          reason: 'Implementation complete',
          createdAt: BigInt(3000),
        },
        {
          ...mockTransition,
          id: 4,
          fromStep: 3,
          toStep: 2,
          fromAgent: 'reviewer',
          toAgent: 'java-backend-developer',
          reason: 'Issues found in error handling',
          createdAt: BigInt(4000),
        },
        {
          ...mockTransition,
          id: 5,
          fromStep: 2,
          toStep: 3,
          fromAgent: 'java-backend-developer',
          toAgent: 'reviewer',
          reason: 'Issues fixed',
          createdAt: BigInt(5000),
        },
        {
          ...mockTransition,
          id: 6,
          fromStep: 3,
          toStep: 4,
          fromAgent: 'reviewer',
          toAgent: null,
          reason: 'Workflow completed successfully',
          createdAt: BigInt(6000),
        },
      ];

      (prisma.workflowTransition.findMany as any).mockResolvedValue(lifecycleTransitions);

      const result = await repository.findByWorkflowId('test-workflow-id');

      expect(result).toHaveLength(6);
      expect(result[0].fromAgent).toBeNull(); // Workflow start
      expect(result[5].toAgent).toBeNull(); // Workflow end

      // Verify retry captured
      const retryTransition = result.find(t => t.reason.includes('Issues found'));
      expect(retryTransition).toBeDefined();
      expect(retryTransition?.fromStep).toBeGreaterThan(retryTransition?.toStep || 0);
    });

    it('should preserve all transition metadata for accountability', async () => {
      const createData = {
        workflowId: 'test-workflow-id',
        fromStep: 1,
        toStep: 2,
        fromAgent: 'architect',
        toAgent: 'java-backend-developer',
        reason: 'Design approved after review',
      };

      (prisma.workflowTransition.create as any).mockResolvedValue({
        ...mockTransition,
        ...createData,
        createdAt: BigInt(Date.now()),
      });

      const result = await repository.createTransition(createData);

      // All fields should be preserved
      expect(result.workflowId).toBe(createData.workflowId);
      expect(result.fromStep).toBe(createData.fromStep);
      expect(result.toStep).toBe(createData.toStep);
      expect(result.fromAgent).toBe(createData.fromAgent);
      expect(result.toAgent).toBe(createData.toAgent);
      expect(result.reason).toBe(createData.reason);
      expect(result.createdAt).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle same-step transitions for state changes', async () => {
      const createData = {
        workflowId: 'test-workflow-id',
        fromStep: 1,
        toStep: 1,
        fromAgent: 'java-backend-developer',
        toAgent: 'java-backend-developer',
        reason: 'Switching complexity from simple to moderate',
      };

      (prisma.workflowTransition.create as any).mockResolvedValue({
        ...mockTransition,
        fromStep: 1,
        toStep: 1,
      });

      const result = await repository.createTransition(createData);

      expect(result.fromStep).toBe(result.toStep);
    });

    it('should handle very long reason strings', async () => {
      const longReason = 'A'.repeat(5000);

      const createData = {
        workflowId: 'test-workflow-id',
        fromStep: 1,
        toStep: 2,
        fromAgent: 'architect',
        toAgent: 'java-backend-developer',
        reason: longReason,
      };

      (prisma.workflowTransition.create as any).mockResolvedValue({
        ...mockTransition,
        reason: longReason,
      });

      const result = await repository.createTransition(createData);

      expect(result.reason).toBe(longReason);
      expect(result.reason.length).toBe(5000);
    });

    it('should handle workflow failure transitions', async () => {
      const createData = {
        workflowId: 'test-workflow-id',
        fromStep: 1,
        toStep: 1,
        fromAgent: 'java-backend-developer',
        toAgent: null,
        reason: 'Build failed: compilation errors in auth module',
      };

      (prisma.workflowTransition.create as any).mockResolvedValue({
        ...mockTransition,
        toAgent: null,
        reason: createData.reason,
      });

      const result = await repository.createTransition(createData);

      expect(result.toAgent).toBeNull();
      expect(result.reason).toContain('failed');
    });
  });
});
