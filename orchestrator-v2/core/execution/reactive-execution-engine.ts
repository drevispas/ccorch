import { EventEmitter } from 'events';
import { Observable, Subject, BehaviorSubject, ReplaySubject, merge, combineLatest, NEVER, timer, from, of, throwError, Subscription } from 'rxjs';
import {
  map,
  filter,
  switchMap,
  mergeMap,
  catchError,
  takeUntil,
  tap,
  startWith,
  scan,
  debounceTime,
  distinctUntilChanged,
  share,
  shareReplay,
  timeout,
} from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

// Core execution types
import {
  ExecutionEngineConfig,
  ExecutionContext,
  ExecutionStatus,
  ExecutableTask,
  TaskExecution,
  TaskPriority,
  ExecutionEvent,
  ExecutionEventType,
  ExecutionObservables,
  Alert,
  ExecutionMetrics,
  TaskMetrics,
  TaskExecutionStatus,
  TraceType,
  TaskId,
  AgentName,
} from './types';

// Component imports
import { TaskScheduler, TaskSchedulerOptions } from './task-scheduler';
import { CircuitBreaker, CircuitBreakerManager } from './circuit-breaker';
import { RetryManager, RetryPolicies } from './retry-manager';
import { CheckpointManager, CheckpointManagerOptions } from './checkpoint-manager';
import { RecoveryManager, RecoveryManagerOptions } from './recovery-manager';
import { ExecutionDebugger, ExecutionDebuggerOptions } from './execution-debugger';
import { ExecutionMonitor } from './execution-monitor';

// Integration imports
import { EventDrivenStateManager } from '../state/event-driven-state-manager';
import { PluginManager } from '../plugins/plugin-manager';
import { CompiledWorkflow, WorkflowContext, ErrorStrategy, TaskStage } from '../workflow/types';
import { WorkflowId } from '../state/types';
import { ComplexityLevel, ContextStatus } from '../enums';
import { WorkflowCompiler } from '../workflow/compiler';

// Observable utilities
import { ExecutionEventStream, stateMachine, cancellable, pausable } from './utils/observable-utils';

export interface ReactiveExecutionEngineOptions {
  // Core configuration
  config?: Partial<ExecutionEngineConfig>;

  // Required dependencies
  stateManager: EventDrivenStateManager;
  pluginManager: PluginManager;
  workflowCompiler?: WorkflowCompiler;

  // Optional component configurations
  schedulerOptions?: Partial<TaskSchedulerOptions>;
  checkpointOptions?: CheckpointManagerOptions;
  recoveryOptions?: RecoveryManagerOptions;
  debugOptions?: ExecutionDebuggerOptions;

  // Feature flags
  enableCircuitBreaker?: boolean;
  enableRetries?: boolean;
  enableCheckpointing?: boolean;
  enableRecovery?: boolean;
  enableDebugging?: boolean;
  enableMonitoring?: boolean;
}

export class ReactiveExecutionEngine extends EventEmitter {
  // Core dependencies
  private stateManager: EventDrivenStateManager;
  private pluginManager: PluginManager;
  private workflowCompiler?: WorkflowCompiler;

  // Execution components (initialized in constructor)
  private taskScheduler!: TaskScheduler;
  private circuitBreakerManager!: CircuitBreakerManager;
  private retryManager!: RetryManager;
  private checkpointManager?: CheckpointManager;
  private recoveryManager?: RecoveryManager;
  private debugger?: ExecutionDebugger;
  private monitor?: ExecutionMonitor;

  // Configuration
  private config: ExecutionEngineConfig;

  // State management
  private activeExecutions: Map<string, ExecutionContext> = new Map();
  private executionStates: Map<string, BehaviorSubject<ExecutionContext>> = new Map();
  private taskExecutions: Map<string, TaskExecution> = new Map();

  // Observable streams (initialized in constructor)
  private eventStream!: ExecutionEventStream;
  private shutdown$ = new Subject<void>();
  private pause$ = new Subject<boolean>();
  private cancel$ = new Subject<Set<string>>();

  // Derived observables (initialized in setupObservables)
  private observables!: ExecutionObservables;
  private subscriptions: Subscription[] = [];

  constructor(options: ReactiveExecutionEngineOptions) {
    super();

    this.stateManager = options.stateManager;
    this.pluginManager = options.pluginManager;
    this.workflowCompiler = options.workflowCompiler;

    // Set default configuration
    this.config = {
      maxConcurrentExecutions: 10,
      maxConcurrentTasks: 50,
      defaultTimeout: 300000, // 5 minutes
      checkpointInterval: 30000, // 30 seconds
      enableCheckpointing: options.enableCheckpointing ?? true,
      enableMetrics: options.enableMonitoring ?? true,
      enableTracing: options.enableDebugging ?? true,
      enableDebug: options.enableDebugging ?? false,
      ...options.config,
    };

    // Initialize event stream
    this.eventStream = new ExecutionEventStream();

    // Initialize components
    this.initializeComponents(options);

    // Setup reactive streams
    this.setupObservables();

    // Setup integration with state manager
    this.setupStateIntegration();
  }

  private initializeComponents(options: ReactiveExecutionEngineOptions): void {
    // Initialize task scheduler with agent execution capability
    this.taskScheduler = new TaskScheduler({
      ...options.schedulerOptions,
      taskExecutor: this.createTaskExecutor(),
    });

    // Initialize circuit breaker manager
    this.circuitBreakerManager = new CircuitBreakerManager(
      this.config.circuitBreakerConfig
    );

    // Initialize retry manager
    this.retryManager = new RetryManager(this.config.retryPolicy);

    // Initialize checkpoint manager if enabled
    if (this.config.enableCheckpointing) {
      this.checkpointManager = new CheckpointManager(
        undefined, // Use default storage
        options.checkpointOptions
      );
    }

    // Initialize recovery manager if enabled and checkpoint manager exists
    if (options.enableRecovery && this.checkpointManager) {
      this.recoveryManager = new RecoveryManager(
        this.checkpointManager,
        options.recoveryOptions
      );
    }

    // Initialize debugger if enabled
    if (this.config.enableDebug) {
      this.debugger = new ExecutionDebugger(options.debugOptions);
    }

    // Initialize monitor if enabled
    if (this.config.enableMetrics) {
      this.monitor = new ExecutionMonitor({
        metricsInterval: 5000,
        metricsRetention: 3600000,
        alertThresholds: {
          errorRate: 0.05,
          taskDuration: 300000,
          memoryUsage: 0.9,
          cpuUsage: 0.8,
          queueLength: 1000,
          circuitBreakerOpen: true,
        },
      });
    }

    // Start components
    this.taskScheduler.start();
    if (this.monitor) {
      this.monitor.on('alert:created', (alert: Alert) => {
        this.eventStream.emitAlert(alert);
      });
    }
  }

  private createTaskExecutor() {
    return async (task: ExecutableTask): Promise<any> => {
      // Create execution context for the task
      const execution: TaskExecution = {
        taskId: task.id,
        executionId: uuidv4(),
        status: TaskExecutionStatus.RUNNING,
        attempts: 1,
        metrics: {
          startTime: Date.now(),
          attempts: 1,
          retries: 0,
          queueTime: 0,
          executionTime: 0,
        },
      };

      try {
        // Record task execution start
        this.taskExecutions.set(task.id, execution);
        this.monitor?.recordTaskExecution(execution);

        // Execute task through plugin manager
        const result = await this.executeTaskWithResilience(task, execution);

        // Update execution status
        execution.status = TaskExecutionStatus.COMPLETED;
        execution.result = result;
        if (execution.metrics) {
          execution.metrics.endTime = Date.now();
          execution.metrics.executionTime = execution.metrics.endTime - execution.metrics.startTime;
        }

        this.eventStream.emitTask(execution);
        return result;

      } catch (error) {
        execution.status = TaskExecutionStatus.FAILED;
        execution.error = {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        };

        this.eventStream.emitTask(execution);
        this.eventStream.emitError(error as Error);
        throw error;
      }
    };
  }

  private async executeTaskWithResilience(
    task: ExecutableTask,
    execution: TaskExecution
  ): Promise<any> {
    const taskId = task.id;

    // Create execution pipeline with circuit breaker and retry logic
    const executionPipeline = from(this.executeTaskThroughAgent(task)).pipe(
      // Apply circuit breaker if enabled
      switchMap(result => {
        if (this.config.circuitBreakerConfig) {
          return this.circuitBreakerManager.executeObservable(
            task.agentName || 'default',
            () => of(result)
          );
        }
        return of(result);
      }),

      // Apply retry logic if enabled
      switchMap(result => {
        if (this.config.retryPolicy) {
          return of(result).pipe(
            this.retryManager.createRetryOperator(taskId, task.retryConfig)
          );
        }
        return of(result);
      }),

      // Add timeout
      timeout(task.timeout || this.config.defaultTimeout),

      // Handle cancellation
      takeUntil(
        this.cancel$.pipe(
          filter(cancelledTasks => cancelledTasks.has(taskId))
        )
      ),

      // Add debugging traces
      tap({
        next: result => {
          if (this.debugger) {
            this.debugger.addTrace(
              execution.executionId,
              TraceType.TASK_END,
              taskId,
              { result },
              0
            );
          }
        },
        error: error => {
          if (this.debugger) {
            this.debugger.addTrace(
              execution.executionId,
              TraceType.ERROR,
              taskId,
              { error: error.message },
              0
            );
          }
        },
      })
    );

    return executionPipeline.toPromise();
  }

  private async executeTaskThroughAgent(task: ExecutableTask): Promise<any> {
    if (!task.agentName) {
      throw new Error('Task must specify an agent name');
    }

    // Get agent plugin
    const agent = await this.pluginManager.getAgent(
      task.agentName,
      task.complexity || ComplexityLevel.MODERATE
    );

    if (!agent) {
      throw new Error(`Agent ${task.agentName} not found`);
    }

    // Execute task through agent
    return agent.execute(task.params || {});
  }

  private setupObservables(): void {
    // Create derived observables
    this.observables = {
      events$: this.eventStream.getEvents(),
      metrics$: this.monitor?.getMetrics().pipe(filter(m => m !== null)) || NEVER,
      tasks$: this.eventStream.getTasks(),
      errors$: this.eventStream.getErrors(),
      state$: this.createExecutionStateStream(),
      debug$: this.debugger?.getEvents().pipe(
        map(event => ({
          timestamp: new Date(),
          type: TraceType.CUSTOM,
          location: 'debug',
          data: event,
          stackDepth: 0,
        }))
      ) || NEVER,
      alerts$: this.eventStream.getAlerts(),
    };

    // Setup state machine for execution lifecycle
    const executionStateMachine = stateMachine(
      ExecutionStatus.PENDING,
      (state: ExecutionStatus, event: ExecutionEvent): ExecutionStatus => {
        switch (event.type) {
          case ExecutionEventType.EXECUTION_STARTED:
            return ExecutionStatus.RUNNING;
          case ExecutionEventType.EXECUTION_COMPLETED:
            return ExecutionStatus.COMPLETED;
          case ExecutionEventType.EXECUTION_FAILED:
            return ExecutionStatus.FAILED;
          case ExecutionEventType.EXECUTION_CANCELLED:
            return ExecutionStatus.CANCELLED;
          case ExecutionEventType.EXECUTION_PAUSED:
            return ExecutionStatus.PAUSED;
          case ExecutionEventType.EXECUTION_RESUMED:
            return ExecutionStatus.RUNNING;
          default:
            return state;
        }
      }
    );

    // Apply state machine to event stream
    const executionStates$ = executionStateMachine(this.observables.events$);

    // Setup pausable execution stream
    const pausableStream$ = this.observables.events$.pipe(
      pausable(this.pause$.pipe(startWith(false)))
    );

    // Setup cancellable execution stream
    const cancellableStream$ = pausableStream$.pipe(
      cancellable(this.shutdown$)
    );

    // Subscribe to state changes for side effects
    const eventSub = cancellableStream$
      .pipe(takeUntil(this.shutdown$))
      .subscribe(event => {
        this.handleExecutionEvent(event);
      });
    this.subscriptions.push(eventSub);
  }

  private createExecutionStateStream(): Observable<ExecutionContext> {
    // Merge all execution state changes
    const stateChanges$ = new Subject<ExecutionContext>();

    // Update stream when executions are added/removed
    this.on('execution:state-changed', (context: ExecutionContext) => {
      stateChanges$.next(context);
    });

    return stateChanges$.pipe(
      startWith(...Array.from(this.activeExecutions.values())),
      shareReplay(1)
    );
  }

  private setupStateIntegration(): void {
    // Subscribe to state manager events
    this.stateManager.on('command:executed', (command: any) => {
      this.eventStream.emit({
        type: ExecutionEventType.EXECUTION_STARTED,
        executionId: command.executionId || uuidv4(),
        timestamp: new Date(),
        data: command,
        source: 'state_manager',
      });
    });

    // Persist execution events to state manager
    const persistSub = this.observables.events$
      .pipe(
        filter(event =>
          event.type === ExecutionEventType.EXECUTION_STARTED ||
          event.type === ExecutionEventType.EXECUTION_COMPLETED ||
          event.type === ExecutionEventType.EXECUTION_FAILED
        ),
        takeUntil(this.shutdown$)
      )
      .subscribe(event => {
        this.stateManager.executeCommand({
          id: uuidv4(),
          type: 'UPDATE_EXECUTION_STATE',
          payload: {
            executionId: event.executionId,
            status: this.mapEventToStatus(event.type),
            timestamp: event.timestamp,
            data: event.data,
          },
          metadata: {
            correlationId: event.executionId,
          },
          timestamp: new Date(),
        });
      });
    this.subscriptions.push(persistSub);
  }

  private mapEventToStatus(eventType: ExecutionEventType): ExecutionStatus {
    switch (eventType) {
      case ExecutionEventType.EXECUTION_STARTED:
        return ExecutionStatus.RUNNING;
      case ExecutionEventType.EXECUTION_COMPLETED:
        return ExecutionStatus.COMPLETED;
      case ExecutionEventType.EXECUTION_FAILED:
        return ExecutionStatus.FAILED;
      case ExecutionEventType.EXECUTION_CANCELLED:
        return ExecutionStatus.CANCELLED;
      default:
        return ExecutionStatus.PENDING;
    }
  }

  private handleExecutionEvent(event: ExecutionEvent): void {
    const executionId = event.executionId;

    switch (event.type) {
      case ExecutionEventType.EXECUTION_STARTED:
        this.handleExecutionStarted(executionId, event.data);
        break;

      case ExecutionEventType.EXECUTION_COMPLETED:
        this.handleExecutionCompleted(executionId, event.data);
        break;

      case ExecutionEventType.EXECUTION_FAILED:
        this.handleExecutionFailed(executionId, event.data);
        break;

      case ExecutionEventType.TASK_STARTED:
        this.handleTaskStarted(event.data);
        break;

      case ExecutionEventType.TASK_COMPLETED:
        this.handleTaskCompleted(event.data);
        break;

      case ExecutionEventType.TASK_FAILED:
        this.handleTaskFailed(event.data);
        break;

      case ExecutionEventType.CHECKPOINT_CREATED:
        this.handleCheckpointCreated(event.data);
        break;

      case ExecutionEventType.RECOVERY_STARTED:
        this.handleRecoveryStarted(event.data);
        break;
    }
  }

  private handleExecutionStarted(executionId: string, data: any): void {
    const context = this.activeExecutions.get(executionId);
    if (context) {
      context.status = ExecutionStatus.RUNNING;
      this.monitor?.registerExecution(context);
      this.emit('execution:state-changed', context);
    }
  }

  private handleExecutionCompleted(executionId: string, data: any): void {
    const context = this.activeExecutions.get(executionId);
    if (context) {
      context.status = ExecutionStatus.COMPLETED;
      context.completedAt = new Date();
      this.monitor?.unregisterExecution(executionId);
      this.emit('execution:state-changed', context);
    }
  }

  private handleExecutionFailed(executionId: string, data: any): void {
    const context = this.activeExecutions.get(executionId);
    if (context) {
      context.status = ExecutionStatus.FAILED;
      context.completedAt = new Date();

      // Trigger recovery if enabled
      if (this.recoveryManager) {
        this.initiateRecovery(executionId, data.error);
      }

      this.emit('execution:state-changed', context);
    }
  }

  private handleTaskStarted(taskData: any): void {
    if (this.debugger) {
      this.debugger.addTrace(
        taskData.executionId,
        TraceType.TASK_START,
        taskData.taskId,
        taskData,
        0
      );
    }
  }

  private handleTaskCompleted(taskData: any): void {
    if (this.debugger) {
      this.debugger.addTrace(
        taskData.executionId,
        TraceType.TASK_END,
        taskData.taskId,
        taskData,
        0
      );
    }
  }

  private handleTaskFailed(taskData: any): void {
    if (this.debugger) {
      this.debugger.addTrace(
        taskData.executionId,
        TraceType.ERROR,
        taskData.taskId,
        taskData,
        0
      );
    }
  }

  private handleCheckpointCreated(checkpointData: any): void {
    this.monitor?.recordCheckpoint();
  }

  private handleRecoveryStarted(recoveryData: any): void {
    this.monitor?.recordRecovery();
  }

  // Public API

  public executeWorkflow(
    workflow: CompiledWorkflow,
    contextInput: Partial<WorkflowContext> = {},
    options: {
      priority?: TaskPriority;
      timeout?: number;
      enableDebugging?: boolean;
      checkpointInterval?: number;
    } = {}
  ): Observable<ExecutionEvent> {
    const executionId = uuidv4();

    // Create full workflow context with defaults
    const workflowContext: WorkflowContext = {
      workflowId: workflow.id,
      executionId,
      variables: new Map(),
      results: new Map(),
      metadata: {},
      checkpoints: [],
      status: ContextStatus.PENDING,
      errors: [],
      ...contextInput
    };

    // Create execution context
    const executionContext: ExecutionContext = {
      executionId,
      workflowId: workflow.id,
      startedAt: new Date(),
      updatedAt: new Date(),
      status: ExecutionStatus.PENDING,
      context: workflowContext,
      traceId: uuidv4(),
      correlationId: uuidv4(),
    };

    this.activeExecutions.set(executionId, executionContext);

    // Register with checkpoint manager
    if (this.checkpointManager) {
      this.checkpointManager.registerExecution(executionContext);
    }

    // Create debug session if enabled
    if (options.enableDebugging && this.debugger) {
      this.debugger.createDebugSession(executionId);
    }

    // Create a ReplaySubject to buffer events for this execution
    const executionEvents = new ReplaySubject<ExecutionEvent>();

    // Subscribe to global events and forward to execution-specific subject
    const globalSub = this.observables.events$.pipe(
      filter(event => event.executionId === executionId)
    ).subscribe({
      next: event => executionEvents.next(event),
      complete: () => executionEvents.complete(),
      error: err => executionEvents.error(err)
    });

    // Emit the start event
    setImmediate(() => {
      this.eventStream.emit({
        type: ExecutionEventType.EXECUTION_STARTED,
        executionId,
        timestamp: new Date(),
        data: { workflow, context: workflowContext, options },
        source: 'reactive_execution_engine',
      });

      // Execute workflow stages
      this.executeWorkflowStages(workflow, executionContext, options);
    });

    // Return observable that will complete when execution finishes
    return executionEvents.asObservable().pipe(
      takeUntil(
        this.observables.events$.pipe(
          filter(event =>
            event.executionId === executionId &&
            (event.type === ExecutionEventType.EXECUTION_COMPLETED ||
             event.type === ExecutionEventType.EXECUTION_FAILED ||
             event.type === ExecutionEventType.EXECUTION_CANCELLED)
          ),
          tap(() => {
            // Clean up
            globalSub.unsubscribe();
            executionEvents.complete();
          })
        )
      )
    );
  }

  private async executeWorkflowStages(
    workflow: CompiledWorkflow,
    executionContext: ExecutionContext,
    options: any
  ): Promise<void> {
    try {
      // Convert workflow stages to executable tasks
      const tasks = this.convertWorkflowToTasks(workflow, executionContext);

      // Schedule tasks based on dependencies and priorities
      for (const task of tasks) {
        const priority = options.priority || TaskPriority.MEDIUM;
        this.taskScheduler.scheduleTask(task, priority);
      }

      // Set up periodic checkpointing if enabled
      if (this.checkpointManager && options.checkpointInterval) {
        this.setupPeriodicCheckpointing(executionContext, options.checkpointInterval);
      }

    } catch (error) {
      this.eventStream.emit({
        type: ExecutionEventType.EXECUTION_FAILED,
        executionId: executionContext.executionId,
        timestamp: new Date(),
        data: { error },
        source: 'reactive_execution_engine',
      });
    }
  }

  private convertWorkflowToTasks(
    workflow: CompiledWorkflow,
    executionContext: ExecutionContext
  ): ExecutableTask[] {
    const tasks: ExecutableTask[] = [];

    // Convert ExecutableStage to ExecutableTask
    if (workflow.executable?.stages) {
      for (const [stageId, stage] of workflow.executable.stages.entries()) {
        const task: ExecutableTask = {
          id: `task_${Date.now()}_${stageId}` as TaskId,
          stageId: stage.id,
          type: this.determineTaskType(stage),
          agentName: this.extractAgentName(stage),
          complexity: ComplexityLevel.MODERATE,
          params: {
            stageId: stage.id,
            workflowId: workflow.id,
            context: executionContext.context,
          },
          timeout: stage.estimateDuration ? stage.estimateDuration() : 60000,
          retryConfig: {
            maxAttempts: 3,
            strategy: 'exponential' as any,
            delay: 1000,
          },
          errorStrategy: ErrorStrategy.FAIL_FAST,
          dependencies: stage.getDependencies ? stage.getDependencies() as TaskId[] : [],
          metadata: {
            canParallelize: stage.canParallelize ? stage.canParallelize() : false,
            estimatedDuration: stage.estimateDuration ? stage.estimateDuration() : undefined,
          },
        };

        tasks.push(task);
      }
    }
    // Also handle pipeline-based workflows (for tests and backward compatibility)
    else if (workflow.source?.pipeline && Array.isArray(workflow.source.pipeline)) {
      for (let i = 0; i < workflow.source.pipeline.length; i++) {
        const stage = workflow.source.pipeline[i];

        // Only create tasks for actual task stages
        if (stage.type === 'task') {
          const taskStage = stage as TaskStage;
          const task: ExecutableTask = {
            id: `task_${Date.now()}_${i}_${stage.id}` as TaskId,
            stageId: stage.id || `stage_${i}`,
            type: 'agent',
            agentName: taskStage.agent as AgentName,
            complexity: taskStage.complexity || ComplexityLevel.MODERATE,
            params: typeof taskStage.input === 'object' ? taskStage.input : {},
            timeout: taskStage.timeout || 60000,
            retryConfig: taskStage.retryConfig || {
              maxAttempts: 3,
              strategy: 'exponential' as any,
              delay: 1000,
            },
            errorStrategy: ErrorStrategy.FAIL_FAST,
            dependencies: taskStage.dependencies || [],
            metadata: taskStage.metadata || {},
          };

          tasks.push(task);
        }
      }
    }

    return tasks;
  }

  private determineTaskType(stage: any): 'agent' | 'transform' | 'wait' | 'subworkflow' {
    // Determine task type based on stage properties or metadata
    // Default to 'agent' for stages that execute agent tasks
    if (stage.id.includes('transform')) {
      return 'transform';
    } else if (stage.id.includes('wait')) {
      return 'wait';
    } else if (stage.id.includes('workflow')) {
      return 'subworkflow';
    }
    return 'agent';
  }

  private extractAgentName(stage: any): AgentName | undefined {
    // Extract agent name from stage ID or metadata
    // This is a simplified implementation
    const stageIdParts = stage.id.split('_');
    if (stageIdParts.length > 1) {
      return stageIdParts[stageIdParts.length - 1] as AgentName;
    }
    return undefined;
  }

  private setupPeriodicCheckpointing(
    executionContext: ExecutionContext,
    interval: number
  ): void {
    const checkpointTimer = setInterval(async () => {
      if (executionContext.status === ExecutionStatus.RUNNING) {
        try {
          await this.createCheckpoint(executionContext.executionId);
        } catch (error) {
          console.error('Failed to create periodic checkpoint:', error);
        }
      } else {
        clearInterval(checkpointTimer);
      }
    }, interval);
  }

  private async createCheckpoint(executionId: string): Promise<void> {
    if (!this.checkpointManager) return;

    const executionContext = this.activeExecutions.get(executionId);
    if (!executionContext) return;

    const taskStates = new Map(
      Array.from(this.taskExecutions.entries()).filter(
        ([_, execution]) => execution.executionId === executionId
      )
    );

    await this.checkpointManager.createCheckpoint(
      executionContext,
      taskStates
    );

    this.eventStream.emit({
      type: ExecutionEventType.CHECKPOINT_CREATED,
      executionId,
      timestamp: new Date(),
      data: {},
      source: 'reactive_execution_engine',
    });
  }

  private async initiateRecovery(executionId: string, error: Error): Promise<void> {
    if (!this.recoveryManager) return;

    try {
      this.eventStream.emit({
        type: ExecutionEventType.RECOVERY_STARTED,
        executionId,
        timestamp: new Date(),
        data: { error },
        source: 'reactive_execution_engine',
      });

      await this.recoveryManager.initiateRecovery(executionId);

      this.eventStream.emit({
        type: ExecutionEventType.RECOVERY_COMPLETED,
        executionId,
        timestamp: new Date(),
        data: {},
        source: 'reactive_execution_engine',
      });

    } catch (recoveryError) {
      this.eventStream.emit({
        type: ExecutionEventType.RECOVERY_FAILED,
        executionId,
        timestamp: new Date(),
        data: { recoveryError },
        source: 'reactive_execution_engine',
      });
    }
  }

  public pauseExecution(executionId: string): boolean {
    const context = this.activeExecutions.get(executionId);
    if (!context || context.status !== ExecutionStatus.RUNNING) {
      return false;
    }

    context.status = ExecutionStatus.PAUSED;
    this.pause$.next(true);

    this.eventStream.emit({
      type: ExecutionEventType.EXECUTION_PAUSED,
      executionId,
      timestamp: new Date(),
      data: {},
      source: 'reactive_execution_engine',
    });

    return true;
  }

  public resumeExecution(executionId: string): boolean {
    const context = this.activeExecutions.get(executionId);
    if (!context || context.status !== ExecutionStatus.PAUSED) {
      return false;
    }

    context.status = ExecutionStatus.RUNNING;
    this.pause$.next(false);

    this.eventStream.emit({
      type: ExecutionEventType.EXECUTION_RESUMED,
      executionId,
      timestamp: new Date(),
      data: {},
      source: 'reactive_execution_engine',
    });

    return true;
  }

  public cancelExecution(executionId: string): boolean {
    const context = this.activeExecutions.get(executionId);
    if (!context) {
      return false;
    }

    context.status = ExecutionStatus.CANCELLED;
    context.completedAt = new Date();

    // Cancel all tasks for this execution
    const executionTasks = new Set(
      Array.from(this.taskExecutions.entries())
        .filter(([_, execution]) => execution.executionId === executionId)
        .map(([taskId]) => taskId)
    );

    this.cancel$.next(executionTasks);

    this.eventStream.emit({
      type: ExecutionEventType.EXECUTION_CANCELLED,
      executionId,
      timestamp: new Date(),
      data: {},
      source: 'reactive_execution_engine',
    });

    return true;
  }

  public async initialize(): Promise<void> {
    // Initialize all execution components
    await Promise.all([
      this.taskScheduler.initialize?.(),
      this.checkpointManager?.initialize?.(),
      this.recoveryManager?.initialize?.(),
      this.debugger?.initialize?.(),
      this.monitor?.initialize?.(),
    ].filter(Boolean));

    this.emit('engine:initialized');
  }

  public async createExecution(workflowId: string, context: WorkflowContext): Promise<string> {
    const executionId = uuidv4();

    // Create execution context
    const executionContext: ExecutionContext = {
      executionId,
      workflowId,
      status: ExecutionStatus.INITIALIZING,
      startedAt: new Date(),
      updatedAt: new Date(),
      context: context,
    };

    // Store execution context
    this.activeExecutions.set(executionId, executionContext);
    this.executionStates.set(executionId, new BehaviorSubject(executionContext));

    // Emit creation event
    this.eventStream.emitExecution({
      type: ExecutionEventType.EXECUTION_STARTED,
      executionId,
      timestamp: new Date(),
      data: { workflowId, context },
      source: 'reactive_execution_engine',
    });

    this.emit('execution:created', executionContext);

    return executionId;
  }

  public getObservables(): ExecutionObservables {
    return this.observables;
  }

  public get events$(): Observable<ExecutionEvent> {
    return this.observables.events$;
  }

  public async getMetrics(): Promise<ExecutionMetrics> {
    const activeExecutions = this.getActiveExecutions();
    const taskMetrics = Array.from(this.taskExecutions.values());

    return {
      startTime: Date.now(),
      tasksTotal: taskMetrics.length,
      tasksCompleted: taskMetrics.filter(t => t.status === TaskExecutionStatus.COMPLETED).length,
      tasksFailed: taskMetrics.filter(t => t.status === TaskExecutionStatus.FAILED).length,
      tasksSkipped: taskMetrics.filter(t => t.status === TaskExecutionStatus.SKIPPED).length,
      avgTaskDuration: 0, // Will be calculated by monitor if available
      p50TaskDuration: 0, // Will be calculated by monitor if available
      p95TaskDuration: 0, // Will be calculated by monitor if available
      p99TaskDuration: 0, // Will be calculated by monitor if available
      cpuUsage: 0, // To be implemented
      memoryUsage: 0, // To be implemented
      throughput: 0, // Will be calculated by monitor if available
      errorRate: taskMetrics.length > 0
        ? (taskMetrics.filter(t => t.status === TaskExecutionStatus.FAILED).length / taskMetrics.length) * 100
        : 0,
      retryRate: taskMetrics.filter(t => t.status === TaskExecutionStatus.RETRYING).length / taskMetrics.length,
      checkpointCount: 0, // To be implemented
      recoveryCount: 0, // To be implemented
    };
  }

  public getActiveExecutions(): ExecutionContext[] {
    return Array.from(this.activeExecutions.values());
  }

  public getExecutionContext(executionId: string): ExecutionContext | undefined {
    return this.activeExecutions.get(executionId);
  }

  public async shutdown(): Promise<void> {
    // Signal shutdown to all components
    this.shutdown$.next();
    this.shutdown$.complete();

    // Clean up all subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];

    // Shutdown components
    await Promise.allSettled([
      this.taskScheduler.shutdown(),
      this.checkpointManager?.shutdown(),
      this.recoveryManager?.shutdown(),
      this.debugger?.shutdown(),
      this.monitor?.shutdown(),
    ]);

    // Complete event stream
    this.eventStream.complete();

    // Complete other subjects
    this.pause$.complete();
    this.cancel$.complete();

    this.emit('engine:shutdown');
  }
}

export default ReactiveExecutionEngine;