import { EventEmitter } from 'events';
import { Observable, Subject, BehaviorSubject, timer, of, throwError } from 'rxjs';
import { mergeMap, catchError, timeout, tap, finalize } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import {
  RecoveryStrategy,
  RecoveryType,
  RecoveryState,
  RecoveryStatus,
  RecoveryAttempt,
  RecoveryMetrics,
  CompensationAction,
  ExecutionContext,
  TaskExecution,
  TaskId,
  ExecutableTask,
  WorkflowId,
} from './types';
import { CheckpointManager } from './checkpoint-manager';

export interface RecoveryManagerOptions {
  maxRecoveryAttempts?: number;
  recoveryTimeout?: number;
  enableAutoRecovery?: boolean;
  autoRecoveryDelay?: number;
  retryStrategies?: RecoveryType[];
  enableCompensation?: boolean;
}

export interface RecoveryPlan {
  strategy: RecoveryStrategy;
  estimatedDuration: number;
  riskLevel: 'low' | 'medium' | 'high';
  alternativeStrategies: RecoveryStrategy[];
  requiredResources: string[];
}

export class RecoveryManager extends EventEmitter {
  private checkpointManager: CheckpointManager;
  private options: Required<RecoveryManagerOptions>;
  private activeRecoveries: Map<string, RecoveryState> = new Map();
  private compensationActions: Map<TaskId, CompensationAction[]> = new Map();
  private recoveryPlans: Map<string, RecoveryPlan> = new Map();
  private metrics$ = new BehaviorSubject<RecoveryMetrics | null>(null);
  private shutdown$ = new Subject<void>();

  constructor(
    checkpointManager: CheckpointManager,
    options: RecoveryManagerOptions = {}
  ) {
    super();

    this.checkpointManager = checkpointManager;
    this.options = {
      maxRecoveryAttempts: options.maxRecoveryAttempts ?? 3,
      recoveryTimeout: options.recoveryTimeout ?? 300000, // 5 minutes
      enableAutoRecovery: options.enableAutoRecovery ?? true,
      autoRecoveryDelay: options.autoRecoveryDelay ?? 5000, // 5 seconds
      retryStrategies: options.retryStrategies ?? [
        RecoveryType.FROM_CHECKPOINT,
        RecoveryType.PARTIAL,
        RecoveryType.COMPENSATE,
      ],
      enableCompensation: options.enableCompensation ?? true,
    };
  }

  public async initialize(): Promise<void> {
    // RecoveryManager is initialized in constructor
    // This method is provided for interface compatibility
  }

  public async analyzeFailure(
    executionId: string,
    failedTasks: TaskId[],
    error: Error
  ): Promise<RecoveryPlan> {
    const plan: RecoveryPlan = {
      strategy: await this.selectRecoveryStrategy(executionId, failedTasks, error),
      estimatedDuration: 0,
      riskLevel: 'medium',
      alternativeStrategies: [],
      requiredResources: [],
    };

    // Analyze available checkpoints
    const checkpoints = await this.checkpointManager.listCheckpoints(executionId);
    const latestCheckpoint = checkpoints
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (latestCheckpoint) {
      // Calculate recovery strategies based on checkpoint age and completeness
      const checkpointAge = Date.now() - latestCheckpoint.createdAt.getTime();

      if (checkpointAge < 60000) { // Less than 1 minute old
        plan.strategy.type = RecoveryType.FROM_CHECKPOINT;
        plan.estimatedDuration = 30000; // 30 seconds
        plan.riskLevel = 'low';
      } else if (checkpointAge < 300000) { // Less than 5 minutes old
        plan.strategy.type = RecoveryType.FROM_CHECKPOINT;
        plan.estimatedDuration = 60000; // 1 minute
        plan.riskLevel = 'medium';
      } else {
        plan.strategy.type = RecoveryType.PARTIAL;
        plan.estimatedDuration = 120000; // 2 minutes
        plan.riskLevel = 'high';
      }
    } else {
      // No checkpoints available
      plan.strategy.type = RecoveryType.FROM_BEGINNING;
      plan.estimatedDuration = 300000; // 5 minutes
      plan.riskLevel = 'high';
    }

    // Add alternative strategies
    plan.alternativeStrategies = await this.generateAlternativeStrategies(
      executionId,
      failedTasks,
      error
    );

    this.recoveryPlans.set(executionId, plan);
    this.emit('recovery:plan-created', { executionId, plan });

    return plan;
  }

  private async selectRecoveryStrategy(
    executionId: string,
    failedTasks: TaskId[],
    error: Error
  ): Promise<RecoveryStrategy> {
    const strategy: RecoveryStrategy = {
      type: RecoveryType.FROM_CHECKPOINT,
      maxRecoveryAttempts: this.options.maxRecoveryAttempts,
      recoveryTimeout: this.options.recoveryTimeout,
    };

    // Analyze error type to determine best strategy
    const errorCode = (error as any).code || error.name;

    switch (errorCode) {
      case 'TIMEOUT':
      case 'NETWORK_ERROR':
        // For transient errors, try from checkpoint first
        strategy.type = RecoveryType.FROM_CHECKPOINT;
        break;

      case 'DATA_CORRUPTION':
      case 'INVALID_STATE':
        // For data issues, may need to restart
        strategy.type = RecoveryType.FROM_BEGINNING;
        break;

      case 'RESOURCE_EXHAUSTED':
        // For resource issues, try partial recovery
        strategy.type = RecoveryType.PARTIAL;
        break;

      case 'BUSINESS_LOGIC_ERROR':
        // For business logic errors, try compensation
        strategy.type = RecoveryType.COMPENSATE;
        if (this.options.enableCompensation) {
          strategy.compensationActions = await this.generateCompensationActions(failedTasks);
        }
        break;

      default:
        // Default to checkpoint recovery
        strategy.type = RecoveryType.FROM_CHECKPOINT;
    }

    return strategy;
  }

  private async generateAlternativeStrategies(
    executionId: string,
    failedTasks: TaskId[],
    error: Error
  ): Promise<RecoveryStrategy[]> {
    const alternatives: RecoveryStrategy[] = [];

    // Always include fallback strategy
    alternatives.push({
      type: RecoveryType.FALLBACK,
      fallbackWorkflowId: `${executionId}_fallback` as WorkflowId,
      maxRecoveryAttempts: 1,
      recoveryTimeout: 60000,
    });

    // Include manual recovery option
    alternatives.push({
      type: RecoveryType.MANUAL,
      maxRecoveryAttempts: 1,
      recoveryTimeout: 0, // No timeout for manual recovery
    });

    // Include compensation if enabled
    if (this.options.enableCompensation) {
      alternatives.push({
        type: RecoveryType.COMPENSATE,
        compensationActions: await this.generateCompensationActions(failedTasks),
        maxRecoveryAttempts: 2,
        recoveryTimeout: 120000,
      });
    }

    return alternatives;
  }

  private async generateCompensationActions(
    failedTasks: TaskId[]
  ): Promise<CompensationAction[]> {
    const actions: CompensationAction[] = [];

    for (const taskId of failedTasks) {
      // Check if compensation actions are registered for this task
      const registeredActions = this.compensationActions.get(taskId);
      if (registeredActions) {
        actions.push(...registeredActions);
      } else {
        // Generate default compensation action
        actions.push({
          taskId,
          action: 'undo',
          condition: 'always',
        });
      }
    }

    return actions;
  }

  public async initiateRecovery(
    executionId: string,
    strategy?: RecoveryStrategy
  ): Promise<RecoveryState> {
    const recoveryId = uuidv4();

    // Use provided strategy or get from plan
    let recoveryStrategy = strategy;
    if (!recoveryStrategy) {
      const plan = this.recoveryPlans.get(executionId);
      if (!plan) {
        throw new Error(`No recovery plan found for execution ${executionId}`);
      }
      recoveryStrategy = plan.strategy;
    }

    // Create recovery state
    const recoveryState: RecoveryState = {
      recoveryId,
      originalExecutionId: executionId,
      recoveryType: recoveryStrategy.type,
      startedAt: new Date(),
      status: RecoveryStatus.INITIATED,
      recoveredTasks: new Set(),
      failedRecoveries: [],
    };

    this.activeRecoveries.set(recoveryId, recoveryState);
    this.emit('recovery:initiated', { recoveryId, executionId, strategy: recoveryStrategy });

    try {
      // Execute recovery based on strategy type
      const result = await this.executeRecovery(recoveryState, recoveryStrategy);

      recoveryState.status = RecoveryStatus.COMPLETED;
      recoveryState.completedAt = new Date();

      this.emit('recovery:completed', { recoveryId, result });
      return recoveryState;

    } catch (error) {
      recoveryState.status = RecoveryStatus.FAILED;
      recoveryState.completedAt = new Date();

      // Try alternative strategy if available
      const plan = this.recoveryPlans.get(executionId);
      if (plan && plan.alternativeStrategies.length > 0) {
        const alternativeStrategy = plan.alternativeStrategies.shift();
        if (alternativeStrategy) {
          this.emit('recovery:trying-alternative', {
            recoveryId,
            alternativeStrategy,
          });
          return this.initiateRecovery(executionId, alternativeStrategy);
        }
      }

      this.emit('recovery:failed', { recoveryId, error });
      throw error;
    } finally {
      this.activeRecoveries.delete(recoveryId);
    }
  }

  private async executeRecovery(
    recoveryState: RecoveryState,
    strategy: RecoveryStrategy
  ): Promise<any> {
    recoveryState.status = RecoveryStatus.RECOVERING;

    const recoveryOperation = this.createRecoveryOperation(recoveryState, strategy);

    return recoveryOperation
      .pipe(
        timeout(strategy.recoveryTimeout),
        tap(result => {
          this.emit('recovery:progress', {
            recoveryId: recoveryState.recoveryId,
            progress: result,
          });
        }),
        catchError(error => {
          const attempt: RecoveryAttempt = {
            attemptNumber: recoveryState.failedRecoveries.length + 1,
            attemptedAt: new Date(),
            strategy: strategy.type,
            error,
            recoveredTasks: [],
          };

          recoveryState.failedRecoveries.push(attempt);

          if (recoveryState.failedRecoveries.length >= strategy.maxRecoveryAttempts) {
            return throwError(() => error);
          }

          // Retry with exponential backoff
          const delay = Math.min(5000 * Math.pow(2, recoveryState.failedRecoveries.length), 30000);
          return timer(delay).pipe(
            mergeMap(() => this.createRecoveryOperation(recoveryState, strategy))
          );
        }),
        finalize(() => {
          this.updateRecoveryMetrics();
        })
      )
      .toPromise();
  }

  private createRecoveryOperation(
    recoveryState: RecoveryState,
    strategy: RecoveryStrategy
  ): Observable<any> {
    switch (strategy.type) {
      case RecoveryType.FROM_CHECKPOINT:
        return this.recoverFromCheckpoint(recoveryState, strategy);

      case RecoveryType.FROM_BEGINNING:
        return this.recoverFromBeginning(recoveryState, strategy);

      case RecoveryType.PARTIAL:
        return this.recoverPartial(recoveryState, strategy);

      case RecoveryType.COMPENSATE:
        return this.executeCompensation(recoveryState, strategy);

      case RecoveryType.FALLBACK:
        return this.executeFallback(recoveryState, strategy);

      case RecoveryType.MANUAL:
        return this.waitForManualRecovery(recoveryState, strategy);

      default:
        return throwError(() => new Error(`Unknown recovery type: ${strategy.type}`));
    }
  }

  private recoverFromCheckpoint(
    recoveryState: RecoveryState,
    strategy: RecoveryStrategy
  ): Observable<any> {
    return new Observable(observer => {
      (async () => {
        try {
          recoveryState.status = RecoveryStatus.ANALYZING;

          // Find best checkpoint
          let restoredState;
          if (strategy.checkpointId) {
            restoredState = await this.checkpointManager.restoreCheckpoint(strategy.checkpointId);
          } else {
            restoredState = await this.checkpointManager.restoreFromLatest(
              recoveryState.originalExecutionId
            );
          }

          if (!restoredState) {
            throw new Error('No checkpoint available for recovery');
          }

          recoveryState.status = RecoveryStatus.RECOVERING;

          // Mark completed tasks as recovered
          for (const [taskId, taskState] of restoredState.taskStates) {
            if (taskState.status === 'completed') {
              recoveryState.recoveredTasks.add(taskId);
            }
          }

          observer.next({
            type: 'checkpoint_restored',
            executionContext: restoredState.executionContext,
            taskStates: restoredState.taskStates,
            recoveredTasks: recoveryState.recoveredTasks.size,
          });

          observer.complete();
        } catch (error) {
          observer.error(error);
        }
      })();
    });
  }

  private recoverFromBeginning(
    recoveryState: RecoveryState,
    strategy: RecoveryStrategy
  ): Observable<any> {
    return new Observable(observer => {
      observer.next({
        type: 'restart_required',
        message: 'Recovery requires restarting execution from beginning',
      });
      observer.complete();
    });
  }

  private recoverPartial(
    recoveryState: RecoveryState,
    strategy: RecoveryStrategy
  ): Observable<any> {
    return new Observable(observer => {
      (async () => {
        try {
          recoveryState.status = RecoveryStatus.ANALYZING;

          // Get latest checkpoint
          const restoredState = await this.checkpointManager.restoreFromLatest(
            recoveryState.originalExecutionId
          );

          if (!restoredState) {
            throw new Error('No checkpoint available for partial recovery');
          }

          recoveryState.status = RecoveryStatus.RECOVERING;

          // Identify which tasks can be recovered
          const recoverableTasks = new Set<TaskId>();
          const dependentTasks = new Set<TaskId>();

          for (const [taskId, taskState] of restoredState.taskStates) {
            if (taskState.status === 'completed') {
              recoverableTasks.add(taskId);
              recoveryState.recoveredTasks.add(taskId);
            } else if (taskState.status === 'failed') {
              // Mark dependent tasks for re-execution
              dependentTasks.add(taskId);
            }
          }

          observer.next({
            type: 'partial_recovery',
            recoverableTasks: Array.from(recoverableTasks),
            dependentTasks: Array.from(dependentTasks),
            executionContext: restoredState.executionContext,
          });

          observer.complete();
        } catch (error) {
          observer.error(error);
        }
      })();
    });
  }

  private executeCompensation(
    recoveryState: RecoveryState,
    strategy: RecoveryStrategy
  ): Observable<any> {
    return new Observable(observer => {
      (async () => {
        try {
          if (!strategy.compensationActions || strategy.compensationActions.length === 0) {
            throw new Error('No compensation actions defined');
          }

          recoveryState.status = RecoveryStatus.COMPENSATING;

          const results = [];
          for (const action of strategy.compensationActions) {
            const result = await this.executeCompensationAction(action);
            results.push(result);

            if (result.success) {
              recoveryState.recoveredTasks.add(action.taskId);
            }
          }

          observer.next({
            type: 'compensation_completed',
            actions: strategy.compensationActions.length,
            successful: results.filter(r => r.success).length,
            results,
          });

          observer.complete();
        } catch (error) {
          observer.error(error);
        }
      })();
    });
  }

  private async executeCompensationAction(action: CompensationAction): Promise<{
    taskId: TaskId;
    action: string;
    success: boolean;
    error?: Error;
  }> {
    try {
      switch (action.action) {
        case 'undo':
          // Implement undo logic
          await this.undoTask(action.taskId);
          break;

        case 'retry':
          // Implement retry logic
          await this.retryTask(action.taskId);
          break;

        case 'skip':
          // Mark task as skipped
          break;

        case 'replace':
          // Execute replacement task
          if (action.compensationTask) {
            await this.executeTask(action.compensationTask);
          }
          break;

        default:
          throw new Error(`Unknown compensation action: ${action.action}`);
      }

      return { taskId: action.taskId, action: action.action, success: true };
    } catch (error) {
      return {
        taskId: action.taskId,
        action: action.action,
        success: false,
        error: error as Error,
      };
    }
  }

  private async undoTask(taskId: TaskId): Promise<void> {
    // Implement task undo logic
    this.emit('compensation:undo', { taskId });
  }

  private async retryTask(taskId: TaskId): Promise<void> {
    // Implement task retry logic
    this.emit('compensation:retry', { taskId });
  }

  private async executeTask(task: ExecutableTask): Promise<void> {
    // Implement task execution logic
    this.emit('compensation:execute', { task });
  }

  private executeFallback(
    recoveryState: RecoveryState,
    strategy: RecoveryStrategy
  ): Observable<any> {
    return new Observable(observer => {
      observer.next({
        type: 'fallback_triggered',
        fallbackWorkflowId: strategy.fallbackWorkflowId,
        message: 'Executing fallback workflow',
      });
      observer.complete();
    });
  }

  private waitForManualRecovery(
    recoveryState: RecoveryState,
    strategy: RecoveryStrategy
  ): Observable<any> {
    return new Observable(observer => {
      recoveryState.status = RecoveryStatus.ANALYZING;

      observer.next({
        type: 'manual_intervention_required',
        message: 'Waiting for manual recovery intervention',
        recoveryId: recoveryState.recoveryId,
      });

      // Don't complete - wait for manual completion
      // observer.complete();
    });
  }

  public async completeManualRecovery(
    recoveryId: string,
    recoveredTasks: TaskId[]
  ): Promise<void> {
    const recoveryState = this.activeRecoveries.get(recoveryId);
    if (!recoveryState) {
      throw new Error(`Recovery ${recoveryId} not found`);
    }

    for (const taskId of recoveredTasks) {
      recoveryState.recoveredTasks.add(taskId);
    }

    recoveryState.status = RecoveryStatus.COMPLETED;
    recoveryState.completedAt = new Date();

    this.emit('recovery:manual-completed', { recoveryId, recoveredTasks });
  }

  public registerCompensationAction(
    taskId: TaskId,
    action: CompensationAction
  ): void {
    const actions = this.compensationActions.get(taskId) || [];
    actions.push(action);
    this.compensationActions.set(taskId, actions);
  }

  public getActiveRecoveries(): Map<string, RecoveryState> {
    return new Map(this.activeRecoveries);
  }

  public async cancelRecovery(recoveryId: string): Promise<boolean> {
    const recoveryState = this.activeRecoveries.get(recoveryId);
    if (!recoveryState) {
      return false;
    }

    recoveryState.status = RecoveryStatus.ABORTED;
    recoveryState.completedAt = new Date();

    this.activeRecoveries.delete(recoveryId);
    this.emit('recovery:cancelled', { recoveryId });

    return true;
  }

  private updateRecoveryMetrics(): void {
    const totalRecoveries = this.activeRecoveries.size;
    const completedRecoveries = Array.from(this.activeRecoveries.values())
      .filter(r => r.status === RecoveryStatus.COMPLETED).length;

    const metrics: RecoveryMetrics = {
      recoveryTime: 0, // Would need to calculate from actual recoveries
      tasksRecovered: 0, // Would need to aggregate
      dataLoss: false,
      attemptCount: 0,
    };

    this.metrics$.next(metrics);
  }

  public getMetrics(): Observable<RecoveryMetrics | null> {
    return this.metrics$.asObservable();
  }

  public async shutdown(): Promise<void> {
    // Cancel all active recoveries
    const cancelPromises = Array.from(this.activeRecoveries.keys())
      .map(recoveryId => this.cancelRecovery(recoveryId));

    await Promise.allSettled(cancelPromises);

    this.shutdown$.next();
    this.shutdown$.complete();

    this.emit('recovery-manager:shutdown');
  }
}

export default RecoveryManager;