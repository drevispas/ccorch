import { describe, it, expect, beforeEach, vi } from 'vitest';
import { archiveOldWorkflows } from '../../../src/services/archival';

describe('Archival Service', () => {
  let mockWorkflowRepo: any;

  beforeEach(() => {
    mockWorkflowRepo = {
      findOldWorkflows: vi.fn(),
      deleteWorkflow: vi.fn()
    };
  });

  describe('archiveOldWorkflows', () => {
    describe('Successful Archival', () => {
      it('should delete COMPLETED workflows older than 30 days', async () => {
        const oldCompletedWorkflows = [
          { id: 'wf-1', status: 'COMPLETED', updatedAt: new Date('2024-01-01') },
          { id: 'wf-2', status: 'COMPLETED', updatedAt: new Date('2024-01-15') }
        ];

        mockWorkflowRepo.findOldWorkflows
          .mockResolvedValueOnce(oldCompletedWorkflows) // COMPLETED
          .mockResolvedValueOnce([]); // FAILED

        mockWorkflowRepo.deleteWorkflow.mockResolvedValue(true);

        const result = await archiveOldWorkflows(mockWorkflowRepo);

        expect(result.completedDeleted).toBe(2);
        expect(result.failedDeleted).toBe(0);
        expect(mockWorkflowRepo.findOldWorkflows).toHaveBeenCalledWith(
          'COMPLETED',
          30
        );
        expect(mockWorkflowRepo.deleteWorkflow).toHaveBeenCalledTimes(2);
        expect(mockWorkflowRepo.deleteWorkflow).toHaveBeenCalledWith('wf-1');
        expect(mockWorkflowRepo.deleteWorkflow).toHaveBeenCalledWith('wf-2');
      });

      it('should delete FAILED workflows older than 90 days', async () => {
        const oldFailedWorkflows = [
          { id: 'wf-3', status: 'FAILED', updatedAt: new Date('2023-10-01') },
          { id: 'wf-4', status: 'FAILED', updatedAt: new Date('2023-11-01') },
          { id: 'wf-5', status: 'FAILED', updatedAt: new Date('2023-12-01') }
        ];

        mockWorkflowRepo.findOldWorkflows
          .mockResolvedValueOnce([]) // COMPLETED
          .mockResolvedValueOnce(oldFailedWorkflows); // FAILED

        mockWorkflowRepo.deleteWorkflow.mockResolvedValue(true);

        const result = await archiveOldWorkflows(mockWorkflowRepo);

        expect(result.completedDeleted).toBe(0);
        expect(result.failedDeleted).toBe(3);
        expect(mockWorkflowRepo.findOldWorkflows).toHaveBeenCalledWith(
          'FAILED',
          90
        );
        expect(mockWorkflowRepo.deleteWorkflow).toHaveBeenCalledTimes(3);
      });

      it('should delete both COMPLETED and FAILED workflows', async () => {
        const oldCompletedWorkflows = [
          { id: 'wf-1', status: 'COMPLETED', updatedAt: new Date('2024-01-01') }
        ];
        const oldFailedWorkflows = [
          { id: 'wf-2', status: 'FAILED', updatedAt: new Date('2023-10-01') }
        ];

        mockWorkflowRepo.findOldWorkflows
          .mockResolvedValueOnce(oldCompletedWorkflows)
          .mockResolvedValueOnce(oldFailedWorkflows);

        mockWorkflowRepo.deleteWorkflow.mockResolvedValue(true);

        const result = await archiveOldWorkflows(mockWorkflowRepo);

        expect(result.completedDeleted).toBe(1);
        expect(result.failedDeleted).toBe(1);
        expect(mockWorkflowRepo.deleteWorkflow).toHaveBeenCalledTimes(2);
      });

      it('should return zero counts if no old workflows found', async () => {
        mockWorkflowRepo.findOldWorkflows
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        const result = await archiveOldWorkflows(mockWorkflowRepo);

        expect(result.completedDeleted).toBe(0);
        expect(result.failedDeleted).toBe(0);
        expect(mockWorkflowRepo.deleteWorkflow).not.toHaveBeenCalled();
      });
    });

    describe('Error Handling', () => {
      it('should continue deletion if one workflow delete fails', async () => {
        const oldCompletedWorkflows = [
          { id: 'wf-1', status: 'COMPLETED', updatedAt: new Date('2024-01-01') },
          { id: 'wf-2', status: 'COMPLETED', updatedAt: new Date('2024-01-02') },
          { id: 'wf-3', status: 'COMPLETED', updatedAt: new Date('2024-01-03') }
        ];

        mockWorkflowRepo.findOldWorkflows
          .mockResolvedValueOnce(oldCompletedWorkflows)
          .mockResolvedValueOnce([]);

        mockWorkflowRepo.deleteWorkflow
          .mockResolvedValueOnce(true)
          .mockRejectedValueOnce(new Error('Delete failed'))
          .mockResolvedValueOnce(true);

        const result = await archiveOldWorkflows(mockWorkflowRepo);

        // Should count only successful deletions
        expect(result.completedDeleted).toBe(2);
        expect(mockWorkflowRepo.deleteWorkflow).toHaveBeenCalledTimes(3);
      });

      it('should handle repository query errors', async () => {
        mockWorkflowRepo.findOldWorkflows.mockRejectedValue(
          new Error('Database error')
        );

        await expect(archiveOldWorkflows(mockWorkflowRepo)).rejects.toThrow(
          'Database error'
        );
      });
    });

    describe('Age Thresholds', () => {
      it('should use correct threshold for COMPLETED workflows (30 days)', async () => {
        mockWorkflowRepo.findOldWorkflows
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        await archiveOldWorkflows(mockWorkflowRepo);

        expect(mockWorkflowRepo.findOldWorkflows).toHaveBeenCalledWith(
          'COMPLETED',
          30
        );
      });

      it('should use correct threshold for FAILED workflows (90 days)', async () => {
        mockWorkflowRepo.findOldWorkflows
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        await archiveOldWorkflows(mockWorkflowRepo);

        expect(mockWorkflowRepo.findOldWorkflows).toHaveBeenCalledWith(
          'FAILED',
          90
        );
      });
    });

    describe('Batch Processing', () => {
      it('should handle large number of old workflows', async () => {
        const oldCompletedWorkflows = Array.from({ length: 1000 }, (_, i) => ({
          id: `wf-${i}`,
          status: 'COMPLETED' as const,
          updatedAt: new Date('2024-01-01')
        }));

        mockWorkflowRepo.findOldWorkflows
          .mockResolvedValueOnce(oldCompletedWorkflows)
          .mockResolvedValueOnce([]);

        mockWorkflowRepo.deleteWorkflow.mockResolvedValue(true);

        const result = await archiveOldWorkflows(mockWorkflowRepo);

        expect(result.completedDeleted).toBe(1000);
        expect(mockWorkflowRepo.deleteWorkflow).toHaveBeenCalledTimes(1000);
      });
    });

    describe('Return Value', () => {
      it('should return object with completedDeleted and failedDeleted counts', async () => {
        mockWorkflowRepo.findOldWorkflows
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        const result = await archiveOldWorkflows(mockWorkflowRepo);

        expect(result).toHaveProperty('completedDeleted');
        expect(result).toHaveProperty('failedDeleted');
        expect(typeof result.completedDeleted).toBe('number');
        expect(typeof result.failedDeleted).toBe('number');
      });
    });
  });
});
