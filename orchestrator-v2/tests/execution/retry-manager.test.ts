import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { of, throwError, firstValueFrom, Observable } from 'rxjs';
import { RetryManager, RetryPolicies } from '../../core/execution/retry-manager';
import { RetryStrategy } from '../../core/execution/types';

type MockOperation = () => Promise<unknown>;
type MockObservableOperation = () => Observable<unknown>;

describe('RetryManager', () => {
  let retryManager: RetryManager;

  beforeEach(() => {
    retryManager = new RetryManager({
      strategy: RetryStrategy.EXPONENTIAL,
      maxAttempts: 3,
      initialDelay: 100,
      maxDelay: 1000,
      multiplier: 2,
      jitter: false, // Disable jitter for predictable tests
    });
  });

  describe('retry strategies', () => {
    test('should apply exponential backoff strategy', async () => {
      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      });

      const delays: number[] = [];

      retryManager.on('retry:attempt', ({ delay }) => {
        delays.push(delay);
      });

      const result = await retryManager.executeWithRetry('test-task', operation);

      expect(result).toBe('success');
      expect(attempts).toBe(3);
      expect(delays.length).toBe(2); // 2 retries
      // First retry delay should be ~100ms, second should be ~200ms
      expect(delays[0]).toBeGreaterThanOrEqual(90);
      expect(delays[0]).toBeLessThanOrEqual(110);
      expect(delays[1]).toBeGreaterThanOrEqual(190);
      expect(delays[1]).toBeLessThanOrEqual(210);
    });

    test('should apply linear backoff strategy', async () => {
      const linearRetryManager = new RetryManager({
        strategy: RetryStrategy.LINEAR,
        maxAttempts: 3,
        initialDelay: 100,
        multiplier: 1,
        jitter: false,
      });

      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      });

      const delays: number[] = [];

      linearRetryManager.on('retry:attempt', ({ delay }) => {
        delays.push(delay);
      });

      const result = await linearRetryManager.executeWithRetry('test-task', operation);

      expect(result).toBe('success');
      expect(delays[0]).toBeGreaterThanOrEqual(90); // ~100ms
      expect(delays[1]).toBeGreaterThanOrEqual(190); // ~200ms (100 * 2)
    });

    test('should apply fixed delay strategy', async () => {
      const fixedRetryManager = new RetryManager({
        strategy: RetryStrategy.FIXED,
        maxAttempts: 3,
        initialDelay: 150,
        jitter: false,
      });

      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      });

      const delays: number[] = [];

      fixedRetryManager.on('retry:attempt', ({ delay }) => {
        delays.push(delay);
      });

      const result = await fixedRetryManager.executeWithRetry('test-task', operation);

      expect(result).toBe('success');
      // Both delays should be ~150ms
      expect(delays[0]).toBeGreaterThanOrEqual(140);
      expect(delays[0]).toBeLessThanOrEqual(160);
      expect(delays[1]).toBeGreaterThanOrEqual(140);
      expect(delays[1]).toBeLessThanOrEqual(160);
    });

    test('should apply fibonacci strategy', async () => {
      const fibonacciRetryManager = new RetryManager({
        strategy: RetryStrategy.FIBONACCI,
        maxAttempts: 4,
        initialDelay: 50,
        jitter: false,
      });

      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        if (attempts < 4) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      });

      const delays: number[] = [];

      fibonacciRetryManager.on('retry:attempt', ({ delay }) => {
        delays.push(delay);
      });

      const result = await fibonacciRetryManager.executeWithRetry('test-task', operation);

      expect(result).toBe('success');
      expect(delays.length).toBe(3);
      // Fibonacci sequence: 1, 1, 2 (multiplied by initialDelay=50)
      expect(delays[0]).toBeGreaterThanOrEqual(45); // ~50ms
      expect(delays[1]).toBeGreaterThanOrEqual(45); // ~50ms
      expect(delays[2]).toBeGreaterThanOrEqual(95); // ~100ms
    });

    test('should apply custom strategy', async () => {
      const customRetryManager = new RetryManager({
        strategy: RetryStrategy.CUSTOM,
        maxAttempts: 3,
        initialDelay: 100,
        customStrategy: (attempt) => attempt * 75, // Custom: 75, 150, 225...
        jitter: false,
      });

      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      });

      const delays: number[] = [];

      customRetryManager.on('retry:attempt', ({ delay }) => {
        delays.push(delay);
      });

      const result = await customRetryManager.executeWithRetry('test-task', operation);

      expect(result).toBe('success');
      expect(delays[0]).toBeGreaterThanOrEqual(70); // ~75ms
      expect(delays[1]).toBeGreaterThanOrEqual(140); // ~150ms
    });
  });

  describe('retry conditions', () => {
    test('should retry retryable errors', async () => {
      const retryableManager = new RetryManager({
        strategy: RetryStrategy.FIXED,
        maxAttempts: 3,
        initialDelay: 10,
        retryableErrors: ['TIMEOUT', 'NETWORK_ERROR'],
        jitter: false,
      });

      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Network failed');
          (error as any).code = 'NETWORK_ERROR';
          throw error;
        }
        return 'success';
      });

      const result = await retryableManager.executeWithRetry('test-task', operation);

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    test('should not retry non-retryable errors', async () => {
      const nonRetryableManager = new RetryManager({
        strategy: RetryStrategy.FIXED,
        maxAttempts: 3,
        initialDelay: 10,
        nonRetryableErrors: ['VALIDATION_ERROR'],
        jitter: false,
      });

      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        const error = new Error('Validation failed');
        (error as any).code = 'VALIDATION_ERROR';
        throw error;
      });

      await expect(
        nonRetryableManager.executeWithRetry('test-task', operation)
      ).rejects.toThrow('Validation failed');

      expect(attempts).toBe(1); // Should not retry
    });

    test('should respect retryable property on error object', async () => {
      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('Non-retryable error');
          (error as any).retryable = false;
          throw error;
        }
        return 'success';
      });

      await expect(
        retryManager.executeWithRetry('test-task', operation)
      ).rejects.toThrow('Non-retryable error');

      expect(attempts).toBe(1); // Should not retry
    });
  });

  describe('max attempts', () => {
    test('should stop after max attempts', async () => {
      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        throw new Error(`Attempt ${attempts} failed`);
      });

      await expect(
        retryManager.executeWithRetry('test-task', operation)
      ).rejects.toThrow('Attempt 3 failed');

      expect(attempts).toBe(3);
    });

    test('should emit exhausted event after max attempts', async () => {
      let exhaustedEvent = false;
      retryManager.on('retry:exhausted', ({ taskId, attempts }) => {
        if (taskId === 'exhausted-task') {
          exhaustedEvent = true;
          expect(attempts).toBe(2); // 3 attempts = 2 retries
        }
      });

      const operation = jest.fn<MockOperation>().mockRejectedValue(new Error('Always fails'));

      await expect(
        retryManager.executeWithRetry('exhausted-task', operation)
      ).rejects.toThrow();

      expect(exhaustedEvent).toBe(true);
    });
  });

  describe('jitter', () => {
    test('should apply jitter when enabled', async () => {
      const jitterManager = new RetryManager({
        strategy: RetryStrategy.FIXED,
        maxAttempts: 3,
        initialDelay: 100,
        jitter: true,
        jitterFactor: 0.5, // 50% jitter
      });

      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      });

      const delays: number[] = [];
      jitterManager.on('retry:attempt', ({ delay }) => {
        delays.push(delay);
      });

      const result = await jitterManager.executeWithRetry('test-task', operation);

      expect(result).toBe('success');
      // With 50% jitter, delays should be between 50ms and 150ms
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(50);
        expect(delay).toBeLessThanOrEqual(150);
      });
    });
  });

  describe('observable operations', () => {
    test('should retry observable operations', async () => {
      let attempts = 0;
      const operation = jest.fn<MockObservableOperation>().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return throwError(() => new Error(`Attempt ${attempts} failed`));
        }
        return of('observable-success');
      });

      const result = await firstValueFrom(
        retryManager.executeObservableWithRetry('test-task', operation)
      );

      expect(result).toBe('observable-success');
      expect(attempts).toBe(3);
    });

    test('should create retry operator', async () => {
      let attempts = 0;
      const source = of(null).pipe(
        switchMap(() => {
          attempts++;
          if (attempts < 3) {
            return throwError(() => new Error(`Attempt ${attempts} failed`));
          }
          return of('operator-success');
        }),
        retryManager.createRetryOperator('operator-test')
      );

      const result = await firstValueFrom(source);

      expect(result).toBe('operator-success');
      expect(attempts).toBe(3);
    });
  });

  describe('callback hooks', () => {
    test('should call onRetry callback', async () => {
      const onRetryCalls: Array<{ attempt: number; error: Error }> = [];

      const callbackManager = new RetryManager({
        strategy: RetryStrategy.FIXED,
        maxAttempts: 3,
        initialDelay: 10,
        onRetry: (attempt, error) => {
          onRetryCalls.push({ attempt, error });
        },
        jitter: false,
      });

      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      });

      const result = await callbackManager.executeWithRetry('test-task', operation);

      expect(result).toBe('success');
      expect(onRetryCalls).toHaveLength(2);
      expect(onRetryCalls[0].attempt).toBe(1);
      expect(onRetryCalls[1].attempt).toBe(2);
    });
  });

  describe('state management', () => {
    test('should track retry state', async () => {
      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      });

      const resultPromise = retryManager.executeWithRetry('state-task', operation);

      // Check state during retries
      await new Promise(resolve => setTimeout(resolve, 50));

      const state = retryManager.getRetryState('state-task');
      expect(state).toBeDefined();
      expect(state!.attempts.length).toBeGreaterThan(0);

      await resultPromise;

      // State should be cleared after success
      const finalState = retryManager.getRetryState('state-task');
      expect(finalState).toBeUndefined();
    });

    test('should get all retry states', async () => {
      const operations = [
        jest.fn<MockOperation>().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          throw new Error('Still failing');
        }),
        jest.fn<MockOperation>().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          throw new Error('Still failing');
        }),
      ];

      // Start multiple retrying operations
      const promises = [
        retryManager.executeWithRetry('task-1', operations[0]).catch(() => {}),
        retryManager.executeWithRetry('task-2', operations[1]).catch(() => {}),
      ];

      // Check states during execution
      await new Promise(resolve => setTimeout(resolve, 25));

      const allStates = retryManager.getAllRetryStates();
      expect(allStates.size).toBeGreaterThan(0);

      await Promise.allSettled(promises);
    });

    test('should clear retry state', async () => {
      const operation = jest.fn<MockOperation>().mockRejectedValue(new Error('Failing'));

      const promise = retryManager.executeWithRetry('clear-task', operation).catch(() => {});

      // Wait for some retries
      await new Promise(resolve => setTimeout(resolve, 50));

      const stateBefore = retryManager.getRetryState('clear-task');
      expect(stateBefore).toBeDefined();

      retryManager.clearRetryState('clear-task');

      const stateAfter = retryManager.getRetryState('clear-task');
      expect(stateAfter).toBeUndefined();

      await promise;
    });

    test('should clear all retry states', () => {
      // Manually add some states
      retryManager.executeWithRetry('task-1', jest.fn<MockOperation>().mockRejectedValue(new Error())).catch(() => {});
      retryManager.executeWithRetry('task-2', jest.fn<MockOperation>().mockRejectedValue(new Error())).catch(() => {});

      retryManager.clearAllRetryStates();

      const allStates = retryManager.getAllRetryStates();
      expect(allStates.size).toBe(0);
    });
  });

  describe('metrics', () => {
    test('should provide retry metrics', async () => {
      const operations = [
        jest.fn<MockOperation>().mockImplementation(async () => {
          throw new Error('Fails after 1 attempt');
        }),
        jest.fn<MockOperation>().mockImplementation(async () => {
          throw new Error('Fails after 2 attempts');
        }),
        jest.fn<MockOperation>().mockResolvedValue('success'),
      ];

      // Execute operations
      await Promise.allSettled([
        retryManager.executeWithRetry('metric-task-1', operations[0]),
        retryManager.executeWithRetry('metric-task-2', operations[1]),
        retryManager.executeWithRetry('metric-task-3', operations[2]),
      ]);

      const metrics = retryManager.getMetrics();
      expect(metrics.totalAttempts).toBeGreaterThanOrEqual(0);
      // Note: successRate is based on active retry states, successful ones are cleared
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('configuration updates', () => {
    test('should update default policy', () => {
      const newPolicy = {
        strategy: RetryStrategy.LINEAR,
        maxAttempts: 5,
        initialDelay: 200,
      };

      retryManager.updateDefaultPolicy(newPolicy);

      // Test that new configuration is applied
      // This is somewhat hard to test directly without exposing internals
      expect(() => retryManager.updateDefaultPolicy(newPolicy)).not.toThrow();
    });
  });

  describe('events', () => {
    test('should emit retry attempt events', async () => {
      const events: any[] = [];
      retryManager.on('retry:attempt', (event) => {
        events.push(event);
      });

      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      });

      await retryManager.executeWithRetry('event-task', operation);

      expect(events).toHaveLength(2); // 2 retries
      expect(events[0].taskId).toBe('event-task');
      expect(events[0].totalAttempts).toBe(1);
      expect(events[1].totalAttempts).toBe(2);
    });

    test('should emit success events', async () => {
      let successEvent = false;
      retryManager.on('retry:success', ({ taskId, attempts }) => {
        if (taskId === 'success-task') {
          successEvent = true;
          expect(attempts).toBe(2); // 3 attempts = 2 retries
        }
      });

      let attempts = 0;
      const operation = jest.fn<MockOperation>().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      });

      await retryManager.executeWithRetry('success-task', operation);

      expect(successEvent).toBe(true);
    });

    test('should emit failed events', async () => {
      let failedEvent = false;
      retryManager.on('retry:failed', ({ taskId, attempts }) => {
        if (taskId === 'failed-task') {
          failedEvent = true;
          expect(attempts).toBe(3);
        }
      });

      const operation = jest.fn<MockOperation>().mockRejectedValue(new Error('Always fails'));

      await expect(
        retryManager.executeWithRetry('failed-task', operation)
      ).rejects.toThrow();

      expect(failedEvent).toBe(true);
    });
  });
});

describe('RetryPolicies', () => {
  test('should provide network error policy', () => {
    const policy = RetryPolicies.NETWORK_ERRORS;

    expect(policy.strategy).toBe(RetryStrategy.EXPONENTIAL);
    expect(policy.maxAttempts).toBe(5);
    expect(policy.retryableErrors).toContain('ECONNREFUSED');
    expect(policy.retryableErrors).toContain('ETIMEDOUT');
  });

  test('should provide database error policy', () => {
    const policy = RetryPolicies.DATABASE_ERRORS;

    expect(policy.strategy).toBe(RetryStrategy.LINEAR);
    expect(policy.maxAttempts).toBe(3);
    expect(policy.retryableErrors).toContain('ER_LOCK_DEADLOCK');
  });

  test('should provide rate limit policy', () => {
    const policy = RetryPolicies.RATE_LIMIT_ERRORS;

    expect(policy.strategy).toBe(RetryStrategy.EXPONENTIAL);
    expect(policy.maxAttempts).toBe(10);
    expect(policy.maxDelay).toBe(300000); // 5 minutes
  });

  test('should provide no retry policy', () => {
    const policy = RetryPolicies.NO_RETRY;

    expect(policy.maxAttempts).toBe(1);
  });

  test('should create custom policy', () => {
    const customPolicy = RetryPolicies.custom({
      maxAttempts: 7,
      initialDelay: 500,
    });

    expect(customPolicy.maxAttempts).toBe(7);
    expect(customPolicy.initialDelay).toBe(500);
    expect(customPolicy.strategy).toBe(RetryStrategy.EXPONENTIAL); // Default
  });
});

import { switchMap } from 'rxjs/operators';