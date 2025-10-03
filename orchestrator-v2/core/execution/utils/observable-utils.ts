import {
  Observable,
  Subject,
  BehaviorSubject,
  ReplaySubject,
  interval,
  timer,
  merge,
  combineLatest,
  race,
  from,
  of,
  throwError,
  EMPTY,
} from 'rxjs';
import {
  map,
  filter,
  tap,
  catchError,
  retry,
  retryWhen,
  delay,
  timeout,
  debounceTime,
  throttleTime,
  distinctUntilChanged,
  switchMap,
  mergeMap,
  concatMap,
  exhaustMap,
  scan,
  reduce,
  take,
  takeUntil,
  takeWhile,
  skip,
  skipUntil,
  skipWhile,
  startWith,
  withLatestFrom,
  share,
  shareReplay,
  buffer,
  bufferTime,
  bufferCount,
  window,
  windowTime,
  windowCount,
  groupBy,
  partition,
  pluck,
  finalize,
} from 'rxjs/operators';
import { ExecutionEvent, Alert, TaskExecution, ExecutionMetrics } from '../types';

// Custom operators
export function retryWithBackoff<T>(
  maxRetries: number = 3,
  initialDelay: number = 1000,
  maxDelay: number = 30000,
  multiplier: number = 2,
  shouldRetry?: (error: any, attempt: number) => boolean
) {
  return (source: Observable<T>) =>
    source.pipe(
      retryWhen(errors =>
        errors.pipe(
          scan((acc, error) => {
            if (acc.attempt >= maxRetries) {
              throw error;
            }
            if (shouldRetry && !shouldRetry(error, acc.attempt)) {
              throw error;
            }
            return {
              error,
              attempt: acc.attempt + 1,
              delay: Math.min(acc.delay * multiplier, maxDelay),
            };
          }, { error: null, attempt: 0, delay: initialDelay }),
          tap(({ attempt, delay }) => console.log(`Retry attempt ${attempt} after ${delay}ms`)),
          map(({ delay }) => delay),
          concatMap(delayTime => timer(delayTime))
        )
      )
    );
}

export function tapLog<T>(prefix: string = '') {
  return tap<T>(value => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}]${prefix ? ` ${prefix}:` : ''} `, value);
  });
}

export function timeoutWithError<T>(duration: number, errorFactory: () => Error) {
  return (source: Observable<T>) =>
    source.pipe(
      timeout(duration),
      catchError(err => {
        if (err.name === 'TimeoutError') {
          return throwError(() => errorFactory());
        }
        return throwError(() => err);
      })
    );
}

export function bufferWhen<T>(
  condition: (value: T) => boolean,
  maxBufferSize: number = 100
) {
  return (source: Observable<T>) => {
    return new Observable<T[]>(observer => {
      let buffer: T[] = [];

      return source.subscribe({
        next(value) {
          buffer.push(value);
          if (condition(value) || buffer.length >= maxBufferSize) {
            observer.next(buffer);
            buffer = [];
          }
        },
        error(err) {
          observer.error(err);
        },
        complete() {
          if (buffer.length > 0) {
            observer.next(buffer);
          }
          observer.complete();
        },
      });
    });
  };
}

export function rateLimit<T>(requestsPerSecond: number) {
  const delayMs = 1000 / requestsPerSecond;
  return (source: Observable<T>) =>
    source.pipe(
      concatMap(value => of(value).pipe(delay(delayMs)))
    );
}

export function circuitBreaker<T>(
  failureThreshold: number = 5,
  resetTimeout: number = 60000,
  halfOpenRequests: number = 1
) {
  let failures = 0;
  let state: 'closed' | 'open' | 'half-open' = 'closed';
  let halfOpenCount = 0;
  let resetTimer: NodeJS.Timeout | null = null;

  return (source: Observable<T>) => {
    return new Observable<T>(observer => {
      const checkCircuit = () => {
        if (state === 'open') {
          observer.error(new Error('Circuit breaker is OPEN'));
          return false;
        }
        if (state === 'half-open' && halfOpenCount >= halfOpenRequests) {
          observer.error(new Error('Circuit breaker is HALF-OPEN, max requests reached'));
          return false;
        }
        return true;
      };

      const handleSuccess = () => {
        if (state === 'half-open') {
          state = 'closed';
          failures = 0;
          halfOpenCount = 0;
          console.log('Circuit breaker: CLOSED (recovered)');
        }
      };

      const handleFailure = () => {
        failures++;
        if (failures >= failureThreshold) {
          state = 'open';
          console.log('Circuit breaker: OPEN');

          if (resetTimer) clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            state = 'half-open';
            halfOpenCount = 0;
            console.log('Circuit breaker: HALF-OPEN');
          }, resetTimeout);
        }
      };

      if (!checkCircuit()) {
        return;
      }

      if (state === 'half-open') {
        halfOpenCount++;
      }

      return source.subscribe({
        next(value) {
          handleSuccess();
          observer.next(value);
        },
        error(err) {
          handleFailure();
          observer.error(err);
        },
        complete() {
          observer.complete();
        },
      });
    });
  };
}

// Execution event stream helpers
export class ExecutionEventStream {
  private events$ = new Subject<ExecutionEvent>();
  private metrics$ = new BehaviorSubject<ExecutionMetrics | null>(null);
  private alerts$ = new Subject<Alert>();
  private tasks$ = new Subject<TaskExecution>();
  private errors$ = new Subject<Error>();

  emit(event: ExecutionEvent): void {
    this.events$.next(event);
  }

  emitExecution(event: ExecutionEvent): void {
    this.events$.next(event);
  }

  emitMetrics(metrics: ExecutionMetrics): void {
    this.metrics$.next(metrics);
  }

  emitAlert(alert: Alert): void {
    this.alerts$.next(alert);
  }

  emitTask(task: TaskExecution): void {
    this.tasks$.next(task);
  }

  emitError(error: Error): void {
    this.errors$.next(error);
  }

  getEvents(): Observable<ExecutionEvent> {
    return this.events$.asObservable();
  }

  getMetrics(): Observable<ExecutionMetrics | null> {
    return this.metrics$.asObservable();
  }

  getAlerts(): Observable<Alert> {
    return this.alerts$.asObservable();
  }

  getTasks(): Observable<TaskExecution> {
    return this.tasks$.asObservable();
  }

  getErrors(): Observable<Error> {
    return this.errors$.asObservable();
  }

  getFilteredEvents(
    eventTypes?: string[],
    executionId?: string
  ): Observable<ExecutionEvent> {
    return this.events$.pipe(
      filter(event => {
        if (eventTypes && !eventTypes.includes(event.type)) {
          return false;
        }
        if (executionId && event.executionId !== executionId) {
          return false;
        }
        return true;
      })
    );
  }

  getAggregatedMetrics(windowMs: number = 5000): Observable<ExecutionMetrics[]> {
    return this.metrics$.pipe(
      filter(metrics => metrics !== null),
      bufferTime(windowMs),
      filter(buffer => buffer.length > 0),
      map(buffer => buffer as ExecutionMetrics[])
    );
  }

  getCriticalAlerts(): Observable<Alert> {
    return this.alerts$.pipe(
      filter(alert => alert.severity === 'critical' || alert.severity === 'error')
    );
  }

  complete(): void {
    this.events$.complete();
    this.metrics$.complete();
    this.alerts$.complete();
    this.tasks$.complete();
    this.errors$.complete();
  }
}

// Metric aggregation helpers
export function aggregateMetrics(
  metrics$: Observable<ExecutionMetrics>
): Observable<{
  avg: ExecutionMetrics;
  min: ExecutionMetrics;
  max: ExecutionMetrics;
  count: number;
}> {
  return metrics$.pipe(
    scan((acc, metric) => {
      const count = acc.count + 1;

      // Update averages
      const avg = { ...acc.avg };
      for (const key in metric) {
        if (typeof metric[key as keyof ExecutionMetrics] === 'number') {
          const currentValue = metric[key as keyof ExecutionMetrics] as number;
          const currentAvg = (acc.avg[key as keyof ExecutionMetrics] as number) || 0;
          (avg[key as keyof ExecutionMetrics] as number) =
            (currentAvg * acc.count + currentValue) / count;
        }
      }

      // Update min/max
      const min = { ...acc.min };
      const max = { ...acc.max };
      for (const key in metric) {
        if (typeof metric[key as keyof ExecutionMetrics] === 'number') {
          const currentValue = metric[key as keyof ExecutionMetrics] as number;
          const currentMin = (acc.min[key as keyof ExecutionMetrics] as number) ?? Infinity;
          const currentMax = (acc.max[key as keyof ExecutionMetrics] as number) ?? -Infinity;

          (min[key as keyof ExecutionMetrics] as number) = Math.min(currentMin, currentValue);
          (max[key as keyof ExecutionMetrics] as number) = Math.max(currentMax, currentValue);
        }
      }

      return { avg, min, max, count };
    }, {
      avg: {} as ExecutionMetrics,
      min: {} as ExecutionMetrics,
      max: {} as ExecutionMetrics,
      count: 0,
    })
  );
}

// Task execution stream helpers
export function groupTasksByStatus(
  tasks$: Observable<TaskExecution>
): Observable<Map<string, TaskExecution[]>> {
  return tasks$.pipe(
    scan((acc, task) => {
      const status = task.status;
      const tasks = acc.get(status) || [];
      tasks.push(task);
      acc.set(status, tasks);
      return acc;
    }, new Map<string, TaskExecution[]>())
  );
}

// Error handling helpers
export function handleErrors<T>(
  fallbackValue?: T,
  logError: boolean = true
) {
  return catchError<T, Observable<T>>((error: Error) => {
    if (logError) {
      console.error('Observable error:', error);
    }
    return fallbackValue !== undefined ? of(fallbackValue) : EMPTY;
  });
}

// Debugging helpers
export function debug<T>(tag: string) {
  return tap<T>({
    next: value => console.log(`[${tag}] Next:`, value),
    error: error => console.error(`[${tag}] Error:`, error),
    complete: () => console.log(`[${tag}] Complete`),
  });
}

// Performance monitoring
export function measurePerformance<T>() {
  let startTime: number;

  return tap<T>({
    subscribe: () => {
      startTime = performance.now();
    },
    next: () => {
      const duration = performance.now() - startTime;
      console.log(`Operation took ${duration.toFixed(2)}ms`);
    },
    complete: () => {
      const duration = performance.now() - startTime;
      console.log(`Stream completed in ${duration.toFixed(2)}ms`);
    },
  });
}

// Workflow control operators
export function pausable<T>(pauser$: Observable<boolean>) {
  return (source: Observable<T>) => {
    return pauser$.pipe(
      switchMap(paused => (paused ? EMPTY : source))
    );
  };
}

export function cancellable<T>(canceller$: Observable<void>) {
  return (source: Observable<T>) => {
    return source.pipe(takeUntil(canceller$));
  };
}

// Batch processing
export function processBatch<T, R>(
  batchSize: number,
  processor: (batch: T[]) => Observable<R>
) {
  return (source: Observable<T>) => {
    return source.pipe(
      bufferCount(batchSize),
      concatMap(batch => processor(batch))
    );
  };
}

// State management helpers
export function stateMachine<S, E>(
  initialState: S,
  reducer: (state: S, event: E) => S
) {
  return (events$: Observable<E>) => {
    return events$.pipe(
      scan((state, event) => reducer(state, event), initialState),
      startWith(initialState),
      shareReplay(1)
    );
  };
}