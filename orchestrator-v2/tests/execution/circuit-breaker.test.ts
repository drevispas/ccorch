import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { firstValueFrom, of, throwError, Observable } from 'rxjs';
import { CircuitBreaker, CircuitBreakerManager } from '../../core/execution/circuit-breaker';
import { CircuitState } from '../../core/execution/types';

type MockOperation = () => Promise<unknown>;
type MockObservableOperation = () => Observable<unknown>;

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      name: 'test-circuit',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      halfOpenMaxAttempts: 1,
      monitoringWindow: 10000,
      minimumRequestCount: 5,
    });
  });

  afterEach(() => {
    circuitBreaker.destroy();
  });

  describe('initialization', () => {
    test('should initialize in closed state', () => {
      const state = circuitBreaker.getState();
      expect(state.state).toBe(CircuitState.CLOSED);
      expect(state.failures).toBe(0);
      expect(state.successes).toBe(0);
    });

    test('should initialize with custom configuration', () => {
      const customCircuit = new CircuitBreaker({
        name: 'custom',
        failureThreshold: 5,
        successThreshold: 3,
      });

      expect(customCircuit).toBeInstanceOf(CircuitBreaker);
      customCircuit.destroy();
    });
  });

  describe('successful operations', () => {
    test('should execute successful operation', async () => {
      const operation = jest.fn<MockOperation>().mockResolvedValue('success');

      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);

      const state = circuitBreaker.getState();
      expect(state.successes).toBe(1);
      expect(state.failures).toBe(0);
    });

    test('should execute successful observable operation', async () => {
      const operation = jest.fn<MockObservableOperation>().mockReturnValue(of('observable-success'));

      const result = await firstValueFrom(circuitBreaker.executeObservable(operation));

      expect(result).toBe('observable-success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should reset failure count on success in closed state', async () => {
      const operation = jest.fn<MockOperation>()
        .mockRejectedValueOnce(new Error('failure'))
        .mockResolvedValue('success');

      // First call fails
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('failure');

      const stateAfterFailure = circuitBreaker.getState();
      expect(stateAfterFailure.failures).toBe(1);

      // Second call succeeds
      await circuitBreaker.execute(operation);

      const stateAfterSuccess = circuitBreaker.getState();
      expect(stateAfterSuccess.failures).toBe(0);
      expect(stateAfterSuccess.successes).toBe(1);
    });
  });

  describe('failure handling', () => {
    test('should track failures', async () => {
      const operation = jest.fn<MockOperation>().mockRejectedValue(new Error('operation failed'));

      await expect(circuitBreaker.execute(operation)).rejects.toThrow('operation failed');

      const state = circuitBreaker.getState();
      expect(state.failures).toBe(1);
      expect(state.successes).toBe(0);
    });

    test('should open circuit after threshold failures', async () => {
      const operation = jest.fn<MockOperation>().mockRejectedValue(new Error('persistent failure'));

      // Reach minimum request count first
      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow();
      }

      const state = circuitBreaker.getState();
      expect(state.state).toBe(CircuitState.OPEN);
      expect(state.failures).toBe(5);
    });

    test('should reject requests when circuit is open', async () => {
      const operation = jest.fn<MockOperation>().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow();
      }

      // Verify circuit is open
      expect(circuitBreaker.getState().state).toBe(CircuitState.OPEN);

      // New requests should be rejected immediately
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is OPEN');
    });

    test('should use fallback when circuit is open', async () => {
      const fallbackCircuit = new CircuitBreaker({
        name: 'fallback-circuit',
        failureThreshold: 3,
        minimumRequestCount: 3,
        fallbackFunction: () => Promise.resolve('fallback-result'),
      });

      const operation = jest.fn<MockOperation>().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(fallbackCircuit.execute(operation)).rejects.toThrow();
      }

      // Next request should use fallback
      const result = await fallbackCircuit.execute(operation);
      expect(result).toBe('fallback-result');

      fallbackCircuit.destroy();
    });
  });

  describe('half-open state', () => {
    test('should transition to half-open after timeout', (done) => {
      const shortTimeoutCircuit = new CircuitBreaker({
        name: 'short-timeout',
        failureThreshold: 2,
        timeout: 100, // Very short timeout
        minimumRequestCount: 2,
      });

      const operation = jest.fn<MockOperation>().mockRejectedValue(new Error('failure'));

      // Open the circuit
      Promise.all([
        shortTimeoutCircuit.execute(operation).catch(() => {}),
        shortTimeoutCircuit.execute(operation).catch(() => {}),
      ]).then(() => {
        expect(shortTimeoutCircuit.getState().state).toBe(CircuitState.OPEN);

        // Wait for timeout
        setTimeout(() => {
          expect(shortTimeoutCircuit.getState().state).toBe(CircuitState.HALF_OPEN);
          shortTimeoutCircuit.destroy();
          done();
        }, 150);
      });
    });

    test('should close circuit on success in half-open state', async () => {
      // Force circuit to half-open
      circuitBreaker.forceHalfOpen();
      expect(circuitBreaker.getState().state).toBe(CircuitState.HALF_OPEN);

      const operation = jest.fn<MockOperation>().mockResolvedValue('success');

      // Successful operations should close the circuit
      await circuitBreaker.execute(operation);
      await circuitBreaker.execute(operation); // Need 2 successes based on successThreshold

      const state = circuitBreaker.getState();
      expect(state.state).toBe(CircuitState.CLOSED);
    });

    test('should open circuit on failure in half-open state', async () => {
      // Force circuit to half-open
      circuitBreaker.forceHalfOpen();
      expect(circuitBreaker.getState().state).toBe(CircuitState.HALF_OPEN);

      const operation = jest.fn<MockOperation>().mockRejectedValue(new Error('failure'));

      await expect(circuitBreaker.execute(operation)).rejects.toThrow();

      const state = circuitBreaker.getState();
      expect(state.state).toBe(CircuitState.OPEN);
    });
  });

  describe('manual control', () => {
    test('should force open circuit', () => {
      circuitBreaker.forceOpen();

      const state = circuitBreaker.getState();
      expect(state.state).toBe(CircuitState.OPEN);
    });

    test('should force close circuit', () => {
      // First open it
      circuitBreaker.forceOpen();
      expect(circuitBreaker.getState().state).toBe(CircuitState.OPEN);

      // Then close it
      circuitBreaker.forceClose();

      const state = circuitBreaker.getState();
      expect(state.state).toBe(CircuitState.CLOSED);
      expect(state.failures).toBe(0);
    });

    test('should force half-open circuit', () => {
      circuitBreaker.forceHalfOpen();

      const state = circuitBreaker.getState();
      expect(state.state).toBe(CircuitState.HALF_OPEN);
      expect(state.halfOpenAttempts).toBe(0);
    });

    test('should reset circuit state', () => {
      // Make some operations to change state
      const operation = jest.fn<MockOperation>().mockRejectedValue(new Error('failure'));
      circuitBreaker.execute(operation).catch(() => {});

      // Reset
      circuitBreaker.reset();

      const state = circuitBreaker.getState();
      expect(state.state).toBe(CircuitState.CLOSED);
      expect(state.failures).toBe(0);
      expect(state.successes).toBe(0);
      expect(state.totalRequests).toBe(0);
    });
  });

  describe('metrics', () => {
    test('should provide circuit metrics', async () => {
      const operation = jest.fn<MockOperation>()
        .mockRejectedValueOnce(new Error('failure'))
        .mockResolvedValue('success');

      await circuitBreaker.execute(operation).catch(() => {});
      await circuitBreaker.execute(operation);

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.failures).toBe(0); // Reset after success
      expect(metrics.successes).toBe(1);
      expect(metrics.state).toBe(CircuitState.CLOSED);
    });

    test('should calculate error rate', async () => {
      const operation = jest.fn<MockOperation>();

      // Mix of successes and failures
      operation.mockResolvedValueOnce('success');
      operation.mockRejectedValueOnce(new Error('failure'));
      operation.mockResolvedValueOnce('success');
      operation.mockRejectedValueOnce(new Error('failure'));
      operation.mockRejectedValueOnce(new Error('failure'));

      await circuitBreaker.execute(operation);
      await circuitBreaker.execute(operation).catch(() => {});
      await circuitBreaker.execute(operation);
      await circuitBreaker.execute(operation).catch(() => {});
      await circuitBreaker.execute(operation).catch(() => {});

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.errorRate).toBeCloseTo(0.6, 1); // 3 failures out of 5 requests
    });
  });

  describe('events', () => {
    test('should emit state change events', (done) => {
      circuitBreaker.on('stateChange', (event) => {
        expect(event.type).toBe('state_change');
        expect(event.newState).toBe(CircuitState.OPEN);
        expect(event.previousState).toBe(CircuitState.CLOSED);
        done();
      });

      circuitBreaker.forceOpen();
    });

    test('should provide state observable', (done) => {
      const stateSubscription = circuitBreaker.getStateObservable().subscribe(state => {
        if (state.state === CircuitState.OPEN) {
          expect(state.state).toBe(CircuitState.OPEN);
          stateSubscription.unsubscribe();
          done();
        }
      });

      circuitBreaker.forceOpen();
    });

    test('should provide events observable', (done) => {
      const eventsSubscription = circuitBreaker.getEvents().subscribe(event => {
        if (event.type === 'state_change') {
          expect(event.newState).toBe(CircuitState.OPEN);
          eventsSubscription.unsubscribe();
          done();
        }
      });

      circuitBreaker.forceOpen();
    });
  });

  describe('configuration updates', () => {
    test('should update configuration', () => {
      circuitBreaker.updateConfig({
        failureThreshold: 10,
        successThreshold: 5,
      });

      // Configuration should be updated (internal state)
      // We can't directly test this without exposing internal config
      // but we can test that it doesn't break the circuit breaker
      expect(circuitBreaker.getState().state).toBe(CircuitState.CLOSED);
    });
  });
});

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager;

  beforeEach(() => {
    manager = new CircuitBreakerManager({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
    });
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('circuit management', () => {
    test('should create and retrieve circuit breakers', () => {
      const breaker1 = manager.getBreaker('service1');
      const breaker2 = manager.getBreaker('service2');
      const breaker1Again = manager.getBreaker('service1');

      expect(breaker1).toBeInstanceOf(CircuitBreaker);
      expect(breaker2).toBeInstanceOf(CircuitBreaker);
      expect(breaker1).toBe(breaker1Again); // Same instance
      expect(breaker1).not.toBe(breaker2); // Different instances
    });

    test('should execute operation through manager', async () => {
      const operation = jest.fn<MockOperation>().mockResolvedValue('manager-success');

      const result = await manager.execute('test-service', operation);

      expect(result).toBe('manager-success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should execute observable operation through manager', async () => {
      const operation = jest.fn<MockObservableOperation>().mockReturnValue(of('observable-manager-success'));

      const result = await firstValueFrom(
        manager.executeObservable('test-service', operation)
      );

      expect(result).toBe('observable-manager-success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should create circuit with custom config', async () => {
      const customConfig = {
        failureThreshold: 5,
        successThreshold: 3,
      };

      const operation = jest.fn<MockOperation>().mockResolvedValue('custom-success');

      const result = await manager.execute('custom-service', operation, customConfig);

      expect(result).toBe('custom-success');
    });
  });

  describe('bulk operations', () => {
    test('should get all circuit breakers', () => {
      manager.getBreaker('service1');
      manager.getBreaker('service2');
      manager.getBreaker('service3');

      const allBreakers = manager.getAllBreakers();
      expect(allBreakers.size).toBe(3);
      expect(allBreakers.has('service1')).toBe(true);
      expect(allBreakers.has('service2')).toBe(true);
      expect(allBreakers.has('service3')).toBe(true);
    });

    test('should get metrics for all circuits', () => {
      manager.getBreaker('service1');
      manager.getBreaker('service2');

      const metrics = manager.getMetrics();
      expect(metrics.size).toBe(2);
      expect(metrics.has('service1')).toBe(true);
      expect(metrics.has('service2')).toBe(true);
    });

    test('should reset all circuits', () => {
      const breaker1 = manager.getBreaker('service1');
      const breaker2 = manager.getBreaker('service2');

      // Modify states
      breaker1.forceOpen();
      breaker2.forceOpen();

      expect(breaker1.getState().state).toBe(CircuitState.OPEN);
      expect(breaker2.getState().state).toBe(CircuitState.OPEN);

      // Reset all
      manager.resetAll();

      expect(breaker1.getState().state).toBe(CircuitState.CLOSED);
      expect(breaker2.getState().state).toBe(CircuitState.CLOSED);
    });

    test('should force open all circuits', () => {
      const breaker1 = manager.getBreaker('service1');
      const breaker2 = manager.getBreaker('service2');

      manager.forceOpenAll();

      expect(breaker1.getState().state).toBe(CircuitState.OPEN);
      expect(breaker2.getState().state).toBe(CircuitState.OPEN);
    });

    test('should force close all circuits', () => {
      const breaker1 = manager.getBreaker('service1');
      const breaker2 = manager.getBreaker('service2');

      // First open them
      breaker1.forceOpen();
      breaker2.forceOpen();

      manager.forceCloseAll();

      expect(breaker1.getState().state).toBe(CircuitState.CLOSED);
      expect(breaker2.getState().state).toBe(CircuitState.CLOSED);
    });
  });

  describe('destruction', () => {
    test('should destroy all circuits', () => {
      const breaker1 = manager.getBreaker('service1');
      const breaker2 = manager.getBreaker('service2');

      expect(manager.getAllBreakers().size).toBe(2);

      manager.destroy();

      expect(manager.getAllBreakers().size).toBe(0);
    });
  });
});