import { EventEmitter } from 'events';
import { Observable, Subject, BehaviorSubject, timer, throwError, of } from 'rxjs';
import { tap, catchError, switchMap, take } from 'rxjs/operators';
import {
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerState,
  CircuitBreakerEvent,
} from './types';

export interface CircuitBreakerOptions extends Partial<CircuitBreakerConfig> {
  name?: string;
}

export class CircuitBreaker extends EventEmitter {
  private name: string;
  private config: CircuitBreakerConfig;
  private state: BehaviorSubject<CircuitBreakerState>;
  private events: Subject<CircuitBreakerEvent>;
  private requestWindow: { timestamp: number; success: boolean }[] = [];
  private resetTimer?: NodeJS.Timeout;

  constructor(options: CircuitBreakerOptions = {}) {
    super();

    this.name = options.name || 'default';
    this.config = {
      failureThreshold: options.failureThreshold ?? 5,
      successThreshold: options.successThreshold ?? 2,
      timeout: options.timeout ?? 60000,
      halfOpenMaxAttempts: options.halfOpenMaxAttempts ?? 3,
      monitoringWindow: options.monitoringWindow ?? 60000,
      minimumRequestCount: options.minimumRequestCount ?? 10,
      fallbackFunction: options.fallbackFunction,
    };

    this.state = new BehaviorSubject<CircuitBreakerState>({
      state: CircuitState.CLOSED,
      failures: 0,
      successes: 0,
      lastStateChangeTime: new Date(),
      halfOpenAttempts: 0,
      totalRequests: 0,
      errorRate: 0,
    });

    this.events = new Subject<CircuitBreakerEvent>();
  }

  private updateState(updates: Partial<CircuitBreakerState>): void {
    const currentState = this.state.value;
    const newState = { ...currentState, ...updates };

    // Calculate error rate
    if (this.requestWindow.length >= (this.config.minimumRequestCount || 0)) {
      const failures = this.requestWindow.filter(r => !r.success).length;
      newState.errorRate = failures / this.requestWindow.length;
    }

    this.state.next(newState);

    // Emit state change event if state changed
    if (updates.state && updates.state !== currentState.state) {
      const event: CircuitBreakerEvent = {
        type: 'state_change',
        previousState: currentState.state,
        newState: updates.state,
        timestamp: new Date(),
      };
      this.events.next(event);
      this.emit('stateChange', event);
    }
  }

  private recordRequest(success: boolean): void {
    const now = Date.now();
    this.requestWindow.push({ timestamp: now, success });

    // Remove old requests outside monitoring window
    const cutoff = now - this.config.monitoringWindow;
    while (this.requestWindow.length > 0 && this.requestWindow[0].timestamp < cutoff) {
      this.requestWindow.shift();
    }

    const currentState = this.state.value;
    const newTotalRequests = currentState.totalRequests + 1;
    const newSuccesses = success ? currentState.successes + 1 : currentState.successes;

    // Calculate error rate based on recent window
    const recentFailures = this.requestWindow.filter(r => !r.success).length;
    const errorRate = this.requestWindow.length > 0 ? recentFailures / this.requestWindow.length : 0;

    this.updateState({
      totalRequests: newTotalRequests,
      successes: newSuccesses,
      errorRate,
      ...(success
        ? { lastSuccessTime: new Date() }
        : { lastFailureTime: new Date() }),
    });
  }

  private tripBreaker(error?: Error): void {
    this.updateState({
      state: CircuitState.OPEN,
      lastStateChangeTime: new Date(),
    });

    const event: CircuitBreakerEvent = {
      type: 'failure',
      error,
      timestamp: new Date(),
      metadata: { reason: 'threshold_exceeded' },
    };
    this.events.next(event);

    // Schedule transition to half-open
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      this.updateState({
        state: CircuitState.HALF_OPEN,
        halfOpenAttempts: 0,
        lastStateChangeTime: new Date(),
      });
    }, this.config.timeout);
  }

  private resetBreaker(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }

    this.updateState({
      state: CircuitState.CLOSED,
      failures: 0,
      successes: 0,
      halfOpenAttempts: 0,
      lastStateChangeTime: new Date(),
    });

    const event: CircuitBreakerEvent = {
      type: 'success',
      timestamp: new Date(),
      metadata: { reason: 'circuit_reset' },
    };
    this.events.next(event);
  }

  public execute<T>(operation: () => Promise<T>): Promise<T> {
    return this.executeObservable(() => from(operation())).toPromise() as Promise<T>;
  }

  public executeObservable<T>(operation: () => Observable<T>): Observable<T> {
    const currentState = this.state.value;

    // Check if circuit is open
    if (currentState.state === CircuitState.OPEN) {
      // Track the failed request even when circuit is open
      this.recordRequest(false);
      this.updateState({
        failures: currentState.failures + 1
      });

      if (this.config.fallbackFunction) {
        const event: CircuitBreakerEvent = {
          type: 'fallback',
          timestamp: new Date(),
        };
        this.events.next(event);
        return from(Promise.resolve(this.config.fallbackFunction({})));
      }
      return throwError(() => new Error(`Circuit breaker is OPEN for ${this.name}`));
    }

    // No need to check max attempts before trying - let requests through in half-open state
    // The max attempts should only apply after consecutive failures

    // Execute operation with timeout
    return timer(0).pipe(
      switchMap(() => operation()),
      tap(() => {
        // Handle success
        this.recordRequest(true);
        const state = this.state.value;

        if (state.state === CircuitState.HALF_OPEN) {
          // Increment success count in half-open
          this.updateState({ successes: state.successes + 1 });

          // Check if we should close the circuit
          const updatedState = this.state.value;
          if (updatedState.successes >= this.config.successThreshold) {
            this.resetBreaker();
          }
        } else if (state.state === CircuitState.CLOSED) {
          // Reset failure count on success in closed state
          if (state.failures > 0) {
            this.updateState({ failures: 0 });
          }
        }
      }),
      catchError((error: Error) => {
        // Handle failure
        this.recordRequest(false);
        const state = this.state.value;

        if (state.state === CircuitState.HALF_OPEN) {
          // Trip immediately on failure in half-open state
          this.tripBreaker(error);
        } else if (state.state === CircuitState.CLOSED) {
          // Increment failure count
          this.updateState({
            failures: state.failures + 1
          });

          // Check if we should open the circuit
          const updatedState = this.state.value;
          if (updatedState.failures >= this.config.failureThreshold) {
            this.tripBreaker(error);
          } else {
            // Also check recent failures in window
            const recentFailures = this.requestWindow.filter(r => !r.success).length;
            if (
              recentFailures >= this.config.failureThreshold &&
              this.requestWindow.length >= (this.config.minimumRequestCount || 0)
            ) {
              this.tripBreaker(error);
            }
          }
        }

        // Don't use fallback on the same request that tripped the circuit
        // Fallback should only be used for subsequent requests
        return throwError(() => error);
      })
    );
  }

  public getState(): CircuitBreakerState {
    return this.state.value;
  }

  public getStateObservable(): Observable<CircuitBreakerState> {
    return this.state.asObservable();
  }

  public getEvents(): Observable<CircuitBreakerEvent> {
    return this.events.asObservable();
  }

  public forceOpen(): void {
    this.updateState({
      state: CircuitState.OPEN,
      lastStateChangeTime: new Date(),
    });
  }

  public forceClose(): void {
    this.resetBreaker();
  }

  public forceHalfOpen(): void {
    this.updateState({
      state: CircuitState.HALF_OPEN,
      halfOpenAttempts: 0,
      lastStateChangeTime: new Date(),
    });
  }

  public reset(): void {
    this.resetBreaker();
    this.requestWindow = [];
    this.updateState({
      totalRequests: 0,
      errorRate: 0,
    });
  }

  public updateConfig(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getMetrics(): {
    state: CircuitState;
    errorRate: number;
    totalRequests: number;
    recentRequests: number;
    failures: number;
    successes: number;
  } {
    const state = this.state.value;
    return {
      state: state.state,
      errorRate: state.errorRate,
      totalRequests: state.totalRequests,
      recentRequests: this.requestWindow.length,
      failures: state.failures,
      successes: state.successes,
    };
  }

  public destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    this.state.complete();
    this.events.complete();
    this.removeAllListeners();
  }
}

// Circuit breaker manager for multiple services
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private defaultConfig: CircuitBreakerConfig;

  constructor(defaultConfig?: Partial<CircuitBreakerConfig>) {
    this.defaultConfig = {
      failureThreshold: defaultConfig?.failureThreshold ?? 5,
      successThreshold: defaultConfig?.successThreshold ?? 2,
      timeout: defaultConfig?.timeout ?? 60000,
      halfOpenMaxAttempts: defaultConfig?.halfOpenMaxAttempts ?? 3,
      monitoringWindow: defaultConfig?.monitoringWindow ?? 60000,
      minimumRequestCount: defaultConfig?.minimumRequestCount ?? 10,
    };
  }

  public getBreaker(
    name: string,
    config?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    let breaker = this.breakers.get(name);

    if (!breaker) {
      breaker = new CircuitBreaker({
        name,
        ...this.defaultConfig,
        ...config,
      });
      this.breakers.set(name, breaker);
    }

    return breaker;
  }

  public execute<T>(
    name: string,
    operation: () => Promise<T>,
    config?: Partial<CircuitBreakerConfig>
  ): Promise<T> {
    const breaker = this.getBreaker(name, config);
    return breaker.execute(operation);
  }

  public executeObservable<T>(
    name: string,
    operation: () => Observable<T>,
    config?: Partial<CircuitBreakerConfig>
  ): Observable<T> {
    const breaker = this.getBreaker(name, config);
    return breaker.executeObservable(operation);
  }

  public getAllBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  public getMetrics(): Map<string, any> {
    const metrics = new Map();
    this.breakers.forEach((breaker, name) => {
      metrics.set(name, breaker.getMetrics());
    });
    return metrics;
  }

  public resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset());
  }

  public forceOpenAll(): void {
    this.breakers.forEach(breaker => breaker.forceOpen());
  }

  public forceCloseAll(): void {
    this.breakers.forEach(breaker => breaker.forceClose());
  }

  public destroy(): void {
    this.breakers.forEach(breaker => breaker.destroy());
    this.breakers.clear();
  }
}

// Export for backward compatibility
export default CircuitBreaker;

// Helper function to create circuit breaker observable operator
export function withCircuitBreaker<T>(
  name: string,
  config?: Partial<CircuitBreakerConfig>
) {
  const breaker = new CircuitBreaker({ name, ...config });

  return (source: Observable<T>) => {
    return new Observable<T>(observer => {
      return breaker.executeObservable(() => source).subscribe(observer);
    });
  };
}

import { from } from 'rxjs';