import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withRetry, cleanupStaleWorkflows } from '../../../src/services/recovery';

describe('Recovery Service', () => {
  describe('withRetry', () => {
    describe('Successful Retry', () => {
      it('should succeed on first attempt if no error', async () => {
        const fn = vi.fn().mockResolvedValue('success');

        const result = await withRetry(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should retry and succeed after transient error', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('Connection lost'))
          .mockResolvedValueOnce('success');

        const result = await withRetry(fn, 3, 10);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should retry multiple times before succeeding', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('Error 1'))
          .mockRejectedValueOnce(new Error('Error 2'))
          .mockResolvedValueOnce('success');

        const result = await withRetry(fn, 3, 10);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
      });
    });

    describe('Max Retries Exceeded', () => {
      it('should throw error after max retries exceeded', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('Persistent error'));

        await expect(withRetry(fn, 3, 10)).rejects.toThrow('Persistent error');
        expect(fn).toHaveBeenCalledTimes(4); // Initial + 3 retries
      });

      it('should respect custom maxRetries parameter', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('Error'));

        await expect(withRetry(fn, 2, 10)).rejects.toThrow('Error');
        expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
      });
    });

    describe('Exponential Backoff', () => {
      it('should wait with exponential backoff between retries', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('Error 1'))
          .mockRejectedValueOnce(new Error('Error 2'))
          .mockResolvedValueOnce('success');

        const startTime = Date.now();
        await withRetry(fn, 3, 50);
        const duration = Date.now() - startTime;

        // Should wait: 50ms (1st retry) + 100ms (2nd retry) = 150ms minimum
        expect(duration).toBeGreaterThanOrEqual(140); // Allow some tolerance
        expect(fn).toHaveBeenCalledTimes(3);
      });

      it('should use custom delay parameter', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('Error'))
          .mockResolvedValueOnce('success');

        const startTime = Date.now();
        await withRetry(fn, 3, 100);
        const duration = Date.now() - startTime;

        // Should wait: 100ms
        expect(duration).toBeGreaterThanOrEqual(90);
      });
    });

    describe('Generic Type Support', () => {
      it('should preserve return type (string)', async () => {
        const fn = async (): Promise<string> => 'result';
        const result = await withRetry(fn);

        expect(typeof result).toBe('string');
        expect(result).toBe('result');
      });

      it('should preserve return type (number)', async () => {
        const fn = async (): Promise<number> => 42;
        const result = await withRetry(fn);

        expect(typeof result).toBe('number');
        expect(result).toBe(42);
      });

      it('should preserve return type (object)', async () => {
        const fn = async () => ({ id: '123', name: 'test' });
        const result = await withRetry(fn);

        expect(result).toMatchObject({ id: '123', name: 'test' });
      });
    });
  });

  describe('cleanupStaleWorkflows', () => {
    let mockWorkflowRepo: any;

    beforeEach(() => {
      mockWorkflowRepo = {
        findActiveStaleWorkflows: vi.fn(),
        updateStatus: vi.fn()
      };
    });

    describe('Stale Workflow Detection', () => {
      it('should find and fail stale workflows past threshold', async () => {
        const staleWorkflows = [
          { id: 'wf-1', updatedAt: new Date(Date.now() - 7200000) }, // 2 hours ago
          { id: 'wf-2', updatedAt: new Date(Date.now() - 3700000) }  // 1+ hour ago
        ];

        mockWorkflowRepo.findActiveStaleWorkflows.mockResolvedValue(staleWorkflows);
        mockWorkflowRepo.updateStatus.mockResolvedValue(undefined);

        const count = await cleanupStaleWorkflows(mockWorkflowRepo, 3600000); // 1 hour

        expect(count).toBe(2);
        expect(mockWorkflowRepo.findActiveStaleWorkflows).toHaveBeenCalledWith(3600000);
        expect(mockWorkflowRepo.updateStatus).toHaveBeenCalledTimes(2);
        expect(mockWorkflowRepo.updateStatus).toHaveBeenCalledWith('wf-1', 'FAILED');
        expect(mockWorkflowRepo.updateStatus).toHaveBeenCalledWith('wf-2', 'FAILED');
      });

      it('should return 0 if no stale workflows found', async () => {
        mockWorkflowRepo.findActiveStaleWorkflows.mockResolvedValue([]);

        const count = await cleanupStaleWorkflows(mockWorkflowRepo);

        expect(count).toBe(0);
        expect(mockWorkflowRepo.updateStatus).not.toHaveBeenCalled();
      });

      it('should use default threshold of 1 hour', async () => {
        mockWorkflowRepo.findActiveStaleWorkflows.mockResolvedValue([]);

        await cleanupStaleWorkflows(mockWorkflowRepo);

        expect(mockWorkflowRepo.findActiveStaleWorkflows).toHaveBeenCalledWith(3600000);
      });

      it('should accept custom threshold', async () => {
        mockWorkflowRepo.findActiveStaleWorkflows.mockResolvedValue([]);

        await cleanupStaleWorkflows(mockWorkflowRepo, 7200000); // 2 hours

        expect(mockWorkflowRepo.findActiveStaleWorkflows).toHaveBeenCalledWith(7200000);
      });
    });

    describe('Error Handling', () => {
      it('should continue cleanup even if one workflow update fails', async () => {
        const staleWorkflows = [
          { id: 'wf-1', updatedAt: new Date(Date.now() - 7200000) },
          { id: 'wf-2', updatedAt: new Date(Date.now() - 7200000) },
          { id: 'wf-3', updatedAt: new Date(Date.now() - 7200000) }
        ];

        mockWorkflowRepo.findActiveStaleWorkflows.mockResolvedValue(staleWorkflows);
        mockWorkflowRepo.updateStatus
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Update failed'))
          .mockResolvedValueOnce(undefined);

        const count = await cleanupStaleWorkflows(mockWorkflowRepo);

        // Should still count successfully updated workflows
        expect(count).toBe(2);
        expect(mockWorkflowRepo.updateStatus).toHaveBeenCalledTimes(3);
      });

      it('should handle repository query errors gracefully', async () => {
        mockWorkflowRepo.findActiveStaleWorkflows.mockRejectedValue(
          new Error('Database connection lost')
        );

        await expect(cleanupStaleWorkflows(mockWorkflowRepo)).rejects.toThrow(
          'Database connection lost'
        );
      });
    });

    describe('Batch Processing', () => {
      it('should handle large number of stale workflows', async () => {
        const staleWorkflows = Array.from({ length: 100 }, (_, i) => ({
          id: `wf-${i}`,
          updatedAt: new Date(Date.now() - 7200000)
        }));

        mockWorkflowRepo.findActiveStaleWorkflows.mockResolvedValue(staleWorkflows);
        mockWorkflowRepo.updateStatus.mockResolvedValue(undefined);

        const count = await cleanupStaleWorkflows(mockWorkflowRepo);

        expect(count).toBe(100);
        expect(mockWorkflowRepo.updateStatus).toHaveBeenCalledTimes(100);
      });
    });
  });
});
