import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient, AgentResult } from '@prisma/client';
import { AgentResultRepository } from '../../../src/models/agent-result-repository';

/**
 * Unit tests for AgentResultRepository
 *
 * Test Suite: AgentResultRepository with Mocked Prisma
 * Purpose: Test repository logic with focus on idempotency enforcement
 * Key Feature: Unique constraint on (workflowId, stepNumber) prevents duplicate submissions
 *
 * Following TDD approach - these tests will fail (red) until implementation is complete
 */

describe('AgentResultRepository', () => {
  let prisma: PrismaClient;
  let repository: AgentResultRepository;
  let mockAgentResult: AgentResult;

  beforeEach(() => {
    // Create mocked Prisma client
    prisma = {
      agentResult: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
    } as any;

    repository = new AgentResultRepository(prisma);

    // Mock agent result data
    mockAgentResult = {
      id: 1,
      workflowId: 'test-workflow-id',
      agentRole: 'architect',
      complexity: 'moderate',
      stepNumber: 0,
      results: JSON.stringify({
        summary: 'Architecture design completed',
        design: { components: ['API', 'DB'] },
      }),
      status: 'COMPLETED',
      createdAt: BigInt(Date.now()),
    };
  });

  describe('createResult()', () => {
    it('should create agent result with timestamp', async () => {
      const createData = {
        workflowId: 'test-workflow-id',
        agentRole: 'architect' as const,
        complexity: 'moderate' as const,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Done' }),
      };

      (prisma.agentResult.create as any).mockResolvedValue(mockAgentResult);

      const result = await repository.createResult(createData);

      expect(prisma.agentResult.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workflowId: createData.workflowId,
          agentRole: createData.agentRole,
          complexity: createData.complexity,
          stepNumber: createData.stepNumber,
          results: createData.results,
          status: 'COMPLETED',
          createdAt: expect.any(BigInt),
        }),
      });
      expect(result).toEqual(mockAgentResult);
    });

    it('should use provided status when specified', async () => {
      const createData = {
        workflowId: 'test-workflow-id',
        agentRole: 'debugger' as const,
        complexity: 'complex' as const,
        stepNumber: 1,
        results: JSON.stringify({ summary: 'Failed' }),
        status: 'FAILED' as const,
      };

      const failedResult = {
        ...mockAgentResult,
        status: 'FAILED',
      };

      (prisma.agentResult.create as any).mockResolvedValue(failedResult);

      const result = await repository.createResult(createData);

      expect(prisma.agentResult.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'FAILED',
        }),
      });
      expect(result.status).toBe('FAILED');
    });

    it('should throw error when duplicate (workflowId, stepNumber) exists', async () => {
      const createData = {
        workflowId: 'test-workflow-id',
        agentRole: 'architect' as const,
        complexity: 'moderate' as const,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Duplicate' }),
      };

      // Simulate Prisma unique constraint violation
      const uniqueConstraintError = new Error(
        'Unique constraint failed on the fields: (`workflow_id`,`step_number`)'
      );
      (uniqueConstraintError as any).code = 'P2002';

      (prisma.agentResult.create as any).mockRejectedValue(uniqueConstraintError);

      await expect(repository.createResult(createData)).rejects.toThrow(
        'Unique constraint failed'
      );
    });

    it('should handle all agent roles', async () => {
      const roles = ['architect', 'backend-developer', 'frontend-developer', 'reviewer', 'debugger'] as const;

      for (const role of roles) {
        const createData = {
          workflowId: 'test-workflow-id',
          agentRole: role,
          complexity: 'moderate' as const,
          stepNumber: 0,
          results: JSON.stringify({ summary: 'Done' }),
        };

        (prisma.agentResult.create as any).mockResolvedValue({
          ...mockAgentResult,
          agentRole: role,
        });

        const result = await repository.createResult(createData);
        expect(result.agentRole).toBe(role);
      }
    });

    it('should handle all complexity levels', async () => {
      const complexities = ['simple', 'moderate', 'complex'] as const;

      for (const complexity of complexities) {
        const createData = {
          workflowId: 'test-workflow-id',
          agentRole: 'architect' as const,
          complexity,
          stepNumber: 0,
          results: JSON.stringify({ summary: 'Done' }),
        };

        (prisma.agentResult.create as any).mockResolvedValue({
          ...mockAgentResult,
          complexity,
        });

        const result = await repository.createResult(createData);
        expect(result.complexity).toBe(complexity);
      }
    });
  });

  describe('findByWorkflowId()', () => {
    it('should find all agent results for a workflow ordered by stepNumber', async () => {
      const results = [
        { ...mockAgentResult, stepNumber: 0 },
        { ...mockAgentResult, id: 2, stepNumber: 1 },
        { ...mockAgentResult, id: 3, stepNumber: 2 },
      ];

      (prisma.agentResult.findMany as any).mockResolvedValue(results);

      const found = await repository.findByWorkflowId('test-workflow-id');

      expect(prisma.agentResult.findMany).toHaveBeenCalledWith({
        where: { workflowId: 'test-workflow-id' },
        orderBy: { stepNumber: 'asc' },
      });
      expect(found).toEqual(results);
      expect(found).toHaveLength(3);
    });

    it('should return empty array when no results exist', async () => {
      (prisma.agentResult.findMany as any).mockResolvedValue([]);

      const found = await repository.findByWorkflowId('non-existent-workflow');

      expect(found).toEqual([]);
    });

    it('should not return results from other workflows', async () => {
      const results = [mockAgentResult];

      (prisma.agentResult.findMany as any).mockResolvedValue(results);

      const found = await repository.findByWorkflowId('test-workflow-id');

      expect(prisma.agentResult.findMany).toHaveBeenCalledWith({
        where: { workflowId: 'test-workflow-id' },
        orderBy: { stepNumber: 'asc' },
      });
      expect(found.every(r => r.workflowId === 'test-workflow-id')).toBe(true);
    });
  });

  describe('findByWorkflowIdAndStep()', () => {
    it('should find agent result by workflow ID and step number', async () => {
      (prisma.agentResult.findFirst as any).mockResolvedValue(mockAgentResult);

      const found = await repository.findByWorkflowIdAndStep('test-workflow-id', 0);

      expect(prisma.agentResult.findFirst).toHaveBeenCalledWith({
        where: {
          workflowId: 'test-workflow-id',
          stepNumber: 0,
        },
      });
      expect(found).toEqual(mockAgentResult);
    });

    it('should return null when result does not exist', async () => {
      (prisma.agentResult.findFirst as any).mockResolvedValue(null);

      const found = await repository.findByWorkflowIdAndStep('test-workflow-id', 99);

      expect(found).toBeNull();
    });

    it('should handle different step numbers', async () => {
      const stepNumbers = [0, 1, 2, 5, 10];

      for (const stepNumber of stepNumbers) {
        (prisma.agentResult.findFirst as any).mockResolvedValue({
          ...mockAgentResult,
          stepNumber,
        });

        const found = await repository.findByWorkflowIdAndStep('test-workflow-id', stepNumber);

        expect(prisma.agentResult.findFirst).toHaveBeenCalledWith({
          where: {
            workflowId: 'test-workflow-id',
            stepNumber,
          },
        });
        expect(found?.stepNumber).toBe(stepNumber);
      }
    });
  });

  describe('idempotency and duplicate handling', () => {
    it('should enforce idempotency by preventing duplicate submissions', async () => {
      const createData = {
        workflowId: 'test-workflow-id',
        agentRole: 'architect' as const,
        complexity: 'moderate' as const,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'First submission' }),
      };

      // First submission succeeds
      (prisma.agentResult.create as any).mockResolvedValueOnce(mockAgentResult);

      const first = await repository.createResult(createData);
      expect(first).toEqual(mockAgentResult);

      // Second submission with same workflowId and stepNumber fails
      const uniqueError = new Error('Unique constraint failed');
      (uniqueError as any).code = 'P2002';
      (prisma.agentResult.create as any).mockRejectedValueOnce(uniqueError);

      await expect(
        repository.createResult({
          ...createData,
          results: JSON.stringify({ summary: 'Second submission' }),
        })
      ).rejects.toThrow('Unique constraint failed');
    });

    it('should allow same stepNumber for different workflows', async () => {
      const workflow1Data = {
        workflowId: 'workflow-1',
        agentRole: 'architect' as const,
        complexity: 'moderate' as const,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Workflow 1' }),
      };

      const workflow2Data = {
        workflowId: 'workflow-2',
        agentRole: 'architect' as const,
        complexity: 'moderate' as const,
        stepNumber: 0,
        results: JSON.stringify({ summary: 'Workflow 2' }),
      };

      (prisma.agentResult.create as any).mockResolvedValueOnce({
        ...mockAgentResult,
        workflowId: 'workflow-1',
      });

      (prisma.agentResult.create as any).mockResolvedValueOnce({
        ...mockAgentResult,
        id: 2,
        workflowId: 'workflow-2',
      });

      const result1 = await repository.createResult(workflow1Data);
      const result2 = await repository.createResult(workflow2Data);

      expect(result1.workflowId).toBe('workflow-1');
      expect(result2.workflowId).toBe('workflow-2');
      expect(result1.stepNumber).toBe(0);
      expect(result2.stepNumber).toBe(0);
    });

    it('should allow different stepNumbers for same workflow', async () => {
      const baseData = {
        workflowId: 'test-workflow-id',
        agentRole: 'architect' as const,
        complexity: 'moderate' as const,
        results: JSON.stringify({ summary: 'Done' }),
      };

      // Create results for different steps
      (prisma.agentResult.create as any).mockResolvedValueOnce({
        ...mockAgentResult,
        stepNumber: 0,
      });

      (prisma.agentResult.create as any).mockResolvedValueOnce({
        ...mockAgentResult,
        id: 2,
        stepNumber: 1,
      });

      (prisma.agentResult.create as any).mockResolvedValueOnce({
        ...mockAgentResult,
        id: 3,
        stepNumber: 2,
      });

      const step0 = await repository.createResult({ ...baseData, stepNumber: 0 });
      const step1 = await repository.createResult({ ...baseData, stepNumber: 1 });
      const step2 = await repository.createResult({ ...baseData, stepNumber: 2 });

      expect(step0.stepNumber).toBe(0);
      expect(step1.stepNumber).toBe(1);
      expect(step2.stepNumber).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle large JSON results', async () => {
      const largeResults = {
        summary: 'Large result',
        data: 'A'.repeat(100000),
        files: Array.from({ length: 1000 }, (_, i) => `file${i}.ts`),
      };

      const createData = {
        workflowId: 'test-workflow-id',
        agentRole: 'backend-developer' as const,
        complexity: 'complex' as const,
        stepNumber: 0,
        results: JSON.stringify(largeResults),
      };

      (prisma.agentResult.create as any).mockResolvedValue({
        ...mockAgentResult,
        results: JSON.stringify(largeResults),
      });

      const result = await repository.createResult(createData);

      expect(result.results).toBe(JSON.stringify(largeResults));
    });

    it('should handle empty results JSON', async () => {
      const createData = {
        workflowId: 'test-workflow-id',
        agentRole: 'reviewer' as const,
        complexity: 'simple' as const,
        stepNumber: 0,
        results: '{}',
      };

      (prisma.agentResult.create as any).mockResolvedValue({
        ...mockAgentResult,
        results: '{}',
      });

      const result = await repository.createResult(createData);

      expect(result.results).toBe('{}');
    });

    it('should handle all agent statuses', async () => {
      const statuses = ['COMPLETED', 'FAILED', 'PARTIAL', 'SKIPPED'] as const;

      for (const status of statuses) {
        const createData = {
          workflowId: 'test-workflow-id',
          agentRole: 'architect' as const,
          complexity: 'moderate' as const,
          stepNumber: 0,
          results: JSON.stringify({ summary: 'Done' }),
          status,
        };

        (prisma.agentResult.create as any).mockResolvedValue({
          ...mockAgentResult,
          status,
        });

        const result = await repository.createResult(createData);
        expect(result.status).toBe(status);
      }
    });
  });
});
