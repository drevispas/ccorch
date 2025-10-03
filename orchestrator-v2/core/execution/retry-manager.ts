import { Observable, throwError, timer, of, defer, firstValueFrom } from 'rxjs';
import { retryWhen, mergeMap, tap, catchError, take } from 'rxjs/operators';
import { EventEmitter } from 'events';
import {
  RetryPolicy,
  RetryStrategy,
  RetryAttempt,
  RetryState,
  TaskError,
} from './types';

export class RetryManager extends EventEmitter {
  private defaultPolicy: RetryPolicy;
  private retryStates: Map<string, RetryState> = new Map();

  constructor(defaultPolicy?: Partial<RetryPolicy>) {
    super();
    this.defaultPolicy = {
      strategy: defaultPolicy?.strategy || RetryStrategy.EXPONENTIAL,
      maxAttempts: defaultPolicy?.maxAttempts || 3,
      initialDelay: defaultPolicy?.initialDelay || 1000,
      maxDelay: defaultPolicy?.maxDelay || 30000,
      multiplier: defaultPolicy?.multiplier || 2,
      jitter: defaultPolicy?.jitter ?? true,
      jitterFactor: defaultPolicy?.jitterFactor || 0.2,
      retryableErrors: defaultPolicy?.retryableErrors || [],
      nonRetryableErrors: defaultPolicy?.nonRetryableErrors || [],
      customStrategy: defaultPolicy?.customStrategy,
      onRetry: defaultPolicy?.onRetry,
    };
  }

  private calculateDelay(attempt: number, policy: RetryPolicy): number {
    let delay: number;

    switch (policy.strategy) {
      case RetryStrategy.EXPONENTIAL:
        delay = Math.min(
          policy.initialDelay * Math.pow(policy.multiplier || 2, attempt - 1),
          policy.maxDelay
        );
        break;

      case RetryStrategy.LINEAR:
        delay = Math.min(
          policy.initialDelay * attempt,
          policy.maxDelay
        );
        break;

      case RetryStrategy.FIXED:
        delay = policy.initialDelay;
        break;

      case RetryStrategy.FIBONACCI:
        delay = Math.min(
          this.fibonacci(attempt) * policy.initialDelay,
          policy.maxDelay
        );
        break;

      case RetryStrategy.CUSTOM:
        if (policy.customStrategy) {
          delay = Math.min(
            policy.customStrategy(attempt),
            policy.maxDelay
          );
        } else {
          delay = policy.initialDelay;
        }
        break;

      default:
        delay = policy.initialDelay;
    }

    // Add jitter if enabled
    if (policy.jitter) {
      const jitterAmount = delay * (policy.jitterFactor || 0.2);
      const randomJitter = (Math.random() - 0.5) * 2 * jitterAmount;
      delay = Math.max(0, delay + randomJitter);
    }

    return Math.round(delay);
  }

  private fibonacci(n: number): number {
    if (n <= 1) return n;
    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) {
      const temp = a + b;
      a = b;
      b = temp;
    }
    return b;
  }

  private shouldRetry(error: Error, policy: RetryPolicy): boolean {
    const errorCode = (error as any).code || error.name || 'UNKNOWN_ERROR';

    // Check non-retryable errors first (blacklist)
    if (policy.nonRetryableErrors && policy.nonRetryableErrors.length > 0) {
      if (policy.nonRetryableErrors.includes(errorCode)) {
        return false;
      }
    }

    // Check retryable errors (whitelist)
    if (policy.retryableErrors && policy.retryableErrors.length > 0) {
      return policy.retryableErrors.includes(errorCode);
    }

    // Check if error has retryable property
    if ('retryable' in error) {
      return (error as any).retryable;
    }

    // Default to retryable
    return true;
  }

  public createRetryOperator<T>(
    taskId: string,
    policy?: Partial<RetryPolicy>
  ) {
    const effectivePolicy: RetryPolicy = { ...this.defaultPolicy, ...policy };

    return (source: Observable<T>) => {
      const retryState: RetryState = {
        attempts: [],
        exhausted: false,
      };

      this.retryStates.set(taskId, retryState);

      return source.pipe(
        retryWhen(errors =>
          errors.pipe(
            mergeMap((error: Error, attemptIndex: number) => {
              const attemptNumber = attemptIndex + 1;

              // Check if should retry
              if (!this.shouldRetry(error, effectivePolicy)) {
                retryState.exhausted = true;
                retryState.lastError = error;
                this.emit('retry:non-retryable', { taskId, error });
                return throwError(() => error);
              }

              // Check if we've exhausted retries (attemptNumber is 1-based)
              if (attemptNumber >= effectivePolicy.maxAttempts) {
                retryState.exhausted = true;
                retryState.lastError = error;
                this.emit('retry:exhausted', { taskId, attempts: attemptNumber, error });
                return throwError(() => error);
              }

              // Calculate delay
              const delay = this.calculateDelay(attemptNumber, effectivePolicy);
              const nextRetryAt = new Date(Date.now() + delay);

              // Record attempt
              const attempt: RetryAttempt = {
                attemptNumber,
                attemptedAt: new Date(),
                error,
                delay,
                willRetry: attemptNumber < effectivePolicy.maxAttempts,
              };

              retryState.attempts.push(attempt);
              retryState.nextRetryAt = nextRetryAt;

              // Call onRetry callback if provided
              if (effectivePolicy.onRetry) {
                effectivePolicy.onRetry(attemptNumber, error);
              }

              // Emit retry event
              this.emit('retry:attempt', {
                taskId,
                attempt,
                totalAttempts: attemptNumber,
                maxAttempts: effectivePolicy.maxAttempts,
                delay,
                nextRetryAt,
              });

              console.log(
                `[RetryManager] Task ${taskId} - Retry attempt ${attemptNumber}/${effectivePolicy.maxAttempts} after ${delay}ms`
              );

              return timer(delay);
            }),
            take(effectivePolicy.maxAttempts)
          )
        ),
        catchError((error: Error) => {
          // Final failure after all retries
          retryState.exhausted = true;
          retryState.lastError = error;

          this.emit('retry:failed', {
            taskId,
            attempts: retryState.attempts.length,
            error,
          });

          return throwError(() => error);
        }),
        tap({
          next: () => {
            // Success - clear retry state
            this.retryStates.delete(taskId);
            this.emit('retry:success', {
              taskId,
              attempts: retryState.attempts.length,
            });
          },
        })
      );
    };
  }

  public async executeWithRetry<T>(
    taskId: string,
    operation: () => Promise<T>,
    policy?: Partial<RetryPolicy>
  ): Promise<T> {
    const observable = defer(() => from(operation()));
    return firstValueFrom(
      observable.pipe(this.createRetryOperator(taskId, policy))
    );
  }

  public executeObservableWithRetry<T>(
    taskId: string,
    operation: () => Observable<T>,
    policy?: Partial<RetryPolicy>
  ): Observable<T> {
    return defer(operation).pipe(this.createRetryOperator(taskId, policy));
  }

  public getRetryState(taskId: string): RetryState | undefined {
    return this.retryStates.get(taskId);
  }

  public getAllRetryStates(): Map<string, RetryState> {
    return new Map(this.retryStates);
  }

  public clearRetryState(taskId: string): void {
    this.retryStates.delete(taskId);
  }

  public clearAllRetryStates(): void {
    this.retryStates.clear();
  }

  public updateDefaultPolicy(policy: Partial<RetryPolicy>): void {
    this.defaultPolicy = { ...this.defaultPolicy, ...policy };
  }

  public getMetrics(): {
    activeRetries: number;
    totalAttempts: number;
    averageAttempts: number;
    successRate: number;
  } {
    const states = Array.from(this.retryStates.values());
    const totalAttempts = states.reduce((sum, state) => sum + state.attempts.length, 0);
    const exhaustedCount = states.filter(state => state.exhausted).length;

    return {
      activeRetries: this.retryStates.size,
      totalAttempts,
      averageAttempts: states.length > 0 ? totalAttempts / states.length : 0,
      successRate: states.length > 0 ? 1 - (exhaustedCount / states.length) : 1,
    };
  }
}

// Specialized retry policies for common scenarios
export class RetryPolicies {
  // Network errors - exponential backoff with jitter
  static readonly NETWORK_ERRORS: RetryPolicy = {
    strategy: RetryStrategy.EXPONENTIAL,
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    multiplier: 2,
    jitter: true,
    jitterFactor: 0.3,
    retryableErrors: [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'EPIPE',
      'ECONNRESET',
    ],
  };

  // Database errors - linear backoff
  static readonly DATABASE_ERRORS: RetryPolicy = {
    strategy: RetryStrategy.LINEAR,
    maxAttempts: 3,
    initialDelay: 2000,
    maxDelay: 10000,
    jitter: false,
    retryableErrors: [
      'ER_LOCK_DEADLOCK',
      'ER_LOCK_WAIT_TIMEOUT',
      'SQLITE_BUSY',
      'SQLITE_LOCKED',
    ],
  };

  // Rate limiting - exponential backoff with long delays
  static readonly RATE_LIMIT_ERRORS: RetryPolicy = {
    strategy: RetryStrategy.EXPONENTIAL,
    maxAttempts: 10,
    initialDelay: 5000,
    maxDelay: 300000, // 5 minutes
    multiplier: 2,
    jitter: true,
    jitterFactor: 0.5,
    retryableErrors: ['429', 'RATE_LIMIT_EXCEEDED', 'TOO_MANY_REQUESTS'],
  };

  // Timeout errors - fixed delay with limited attempts
  static readonly TIMEOUT_ERRORS: RetryPolicy = {
    strategy: RetryStrategy.FIXED,
    maxAttempts: 2,
    initialDelay: 3000,
    maxDelay: 3000,
    jitter: false,
    retryableErrors: ['ETIMEDOUT', 'TIMEOUT', 'REQUEST_TIMEOUT'],
  };

  // Service unavailable - fibonacci backoff
  static readonly SERVICE_UNAVAILABLE: RetryPolicy = {
    strategy: RetryStrategy.FIBONACCI,
    maxAttempts: 7,
    initialDelay: 1000,
    maxDelay: 60000,
    jitter: true,
    jitterFactor: 0.2,
    retryableErrors: ['503', 'SERVICE_UNAVAILABLE', 'MAINTENANCE_MODE'],
  };

  // No retry policy
  static readonly NO_RETRY: RetryPolicy = {
    strategy: RetryStrategy.FIXED,
    maxAttempts: 1,
    initialDelay: 0,
    maxDelay: 0,
    jitter: false,
  };

  // Aggressive retry for critical operations
  static readonly AGGRESSIVE: RetryPolicy = {
    strategy: RetryStrategy.EXPONENTIAL,
    maxAttempts: 15,
    initialDelay: 500,
    maxDelay: 60000,
    multiplier: 1.5,
    jitter: true,
    jitterFactor: 0.4,
  };

  // Custom policy factory
  static custom(overrides: Partial<RetryPolicy>): RetryPolicy {
    return {
      strategy: RetryStrategy.EXPONENTIAL,
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      multiplier: 2,
      jitter: true,
      jitterFactor: 0.2,
      ...overrides,
    };
  }
}

// Retry decorator for class methods
export function Retry(policy?: Partial<RetryPolicy>) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const manager = new RetryManager(policy);

    descriptor.value = async function (...args: any[]) {
      const taskId = `${target.constructor.name}.${propertyKey}`;
      return manager.executeWithRetry(
        taskId,
        () => originalMethod.apply(this, args),
        policy
      );
    };

    return descriptor;
  };
}

// Export for convenience
export default RetryManager;

import { from } from 'rxjs';