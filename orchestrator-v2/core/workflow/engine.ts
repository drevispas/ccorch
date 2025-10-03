import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkflowDSL,
  CompiledWorkflow,
  ExecutableWorkflow,
  WorkflowContext,
  StageResult,
  StageId,
  PipelineStage,
  StageType,
  TaskStage,
  WorkflowError,
} from './types';
import { WorkflowCompiler } from './compiler';
import { WorkflowOptimizer, OptimizationOptions } from './optimizer';
import { WorkflowVersionManager } from './versioning';
import { EventDrivenStateManager } from '../state/event-driven-state-manager';
import { PluginManager } from '../plugins/plugin-manager';
import { Command, WorkflowId, TaskStatus, WorkflowStatus, Query } from '../state/types';
import { ContextStatus } from '../enums';

export interface WorkflowEngineOptions {
  stateManager: EventDrivenStateManager;
  pluginManager: PluginManager;
  compiler?: WorkflowCompiler;
  optimizer?: WorkflowOptimizer;
  versionManager?: WorkflowVersionManager;
  enableOptimization?: boolean;
  optimizationOptions?: OptimizationOptions;
  maxConcurrentWorkflows?: number;
  executionTimeout?: number;
  checkpointInterval?: number;
  enableCheckpointing?: boolean;
  enableMetrics?: boolean;
  enableTracing?: boolean;
}

export interface WorkflowExecution {
  id: string;
  workflowId: WorkflowId;
  status: WorkflowStatus;
  context: WorkflowContext;
  compiledWorkflow: CompiledWorkflow;
  startedAt: Date;
  completedAt?: Date;
  error?: WorkflowError;
  metrics?: ExecutionMetrics;
}

export interface ExecutionMetrics {
  totalDuration: number;
  stageDurations: Map<StageId, number>;
  stageRetries: Map<StageId, number>;
  memoryUsage: number;
  cpuUsage: number;
  throughput: number;
  errorRate: number;
}

export interface WorkflowEvent {
  type: 'workflow:started' | 'workflow:completed' | 'workflow:failed' | 'workflow:cancelled' |
        'stage:started' | 'stage:completed' | 'stage:failed' | 'stage:skipped' |
        'checkpoint:created' | 'checkpoint:restored' | 'metric:recorded';
  workflowId: WorkflowId;
  executionId: string;
  stageId?: StageId;
  timestamp: Date;
  data?: any;
}

export class WorkflowEngine extends EventEmitter {
  private options: WorkflowEngineOptions;
  private compiler: WorkflowCompiler;
  private optimizer: WorkflowOptimizer;
  private versionManager: WorkflowVersionManager;
  private executions: Map<string, WorkflowExecution>;
  private activeWorkflows: number;
  private metricsCollector?: MetricsCollector;

  constructor(options: WorkflowEngineOptions) {
    super();
    this.options = options;
    this.compiler = options.compiler || new WorkflowCompiler({
      stateManager: options.stateManager,
      pluginManager: options.pluginManager,
    });
    this.optimizer = options.optimizer || new WorkflowOptimizer();
    this.versionManager = options.versionManager || new WorkflowVersionManager();
    this.executions = new Map();
    this.activeWorkflows = 0;

    if (options.enableMetrics) {
      this.metricsCollector = new MetricsCollector();
    }

    this.setupEventHandlers();
  }

  // =====================
  // Workflow Execution
  // =====================

  public async execute(workflow: WorkflowDSL): Promise<WorkflowExecution> {
    const executionId = uuidv4();
    const startedAt = new Date();

    try {
      // Check concurrent workflow limit
      if (this.options.maxConcurrentWorkflows &&
          this.activeWorkflows >= this.options.maxConcurrentWorkflows) {
        throw new Error('Maximum concurrent workflows limit reached');
      }

      this.activeWorkflows++;

      // Migrate workflow if needed
      if (workflow.metadata.version !== this.versionManager.getLatestVersion()) {
        const migrationResult = await this.versionManager.migrateWorkflow(workflow);
        workflow = migrationResult.workflow;
      }

      // Compile workflow
      let compiledWorkflow = await this.compiler.compile(workflow);

      // Optimize if enabled
      if (this.options.enableOptimization) {
        const optimizationResult = this.optimizer.optimize(
          workflow,
          compiledWorkflow.ast,
          this.options.optimizationOptions
        );
        compiledWorkflow = await this.compiler.compile(optimizationResult.optimizedWorkflow);
      }

      // Create execution context
      const execution: WorkflowExecution = {
        id: executionId,
        workflowId: workflow.metadata.id,
        status: WorkflowStatus.INITIALIZING,
        context: compiledWorkflow.executable.context,
        compiledWorkflow,
        startedAt,
      };

      this.executions.set(executionId, execution);

      // Emit workflow started event
      this.emitWorkflowEvent({
        type: 'workflow:started',
        workflowId: workflow.metadata.id,
        executionId,
        timestamp: startedAt,
      });

      // Initialize state in EventDrivenStateManager
      await this.initializeWorkflowState(workflow.metadata.id, executionId, execution.context);

      // Execute the workflow
      const result = await this.executeWorkflow(execution);

      // Update execution
      execution.status = WorkflowStatus.COMPLETED;
      execution.completedAt = new Date();

      // Emit workflow completed event
      this.emitWorkflowEvent({
        type: 'workflow:completed',
        workflowId: workflow.metadata.id,
        executionId,
        timestamp: execution.completedAt,
        data: result,
      });

      // Update state in EventDrivenStateManager
      await this.updateWorkflowState(workflow.metadata.id, executionId, WorkflowStatus.COMPLETED);

      return execution;
    } catch (error) {
      const workflowError: WorkflowError = {
        code: 'WORKFLOW_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        stack: error instanceof Error ? error.stack : undefined,
      };

      const execution = this.executions.get(executionId);
      if (execution) {
        execution.status = WorkflowStatus.FAILED;
        execution.completedAt = new Date();
        execution.error = workflowError;

        // Emit workflow failed event
        this.emitWorkflowEvent({
          type: 'workflow:failed',
          workflowId: execution.workflowId,
          executionId,
          timestamp: execution.completedAt,
          data: workflowError,
        });

        // Update state in EventDrivenStateManager
        await this.updateWorkflowState(
          execution.workflowId,
          executionId,
          WorkflowStatus.FAILED,
          workflowError
        );
      }

      throw error;
    } finally {
      this.activeWorkflows--;
    }
  }

  private async executeWorkflow(execution: WorkflowExecution): Promise<any> {
    const { compiledWorkflow, context } = execution;
    const { executable } = compiledWorkflow;
    const results: any[] = [];

    // Update status
    execution.status = WorkflowStatus.RUNNING;
    context.status = ContextStatus.RUNNING;
    context.startedAt = new Date();

    // Execute stages according to execution plan
    const { executionPlan } = executable;

    for (const phase of executionPlan.phases) {
      if (phase.parallel) {
        // Execute stages in parallel
        const parallelResults = await this.executeParallelPhase(
          phase.stages,
          executable,
          context,
          execution
        );
        results.push(...parallelResults);
      } else {
        // Execute stages sequentially
        for (const stageId of phase.stages) {
          const result = await this.executeStage(
            stageId,
            executable,
            context,
            execution
          );
          results.push(result);

          // Check for cancellation
          if ((execution.status as WorkflowStatus) === WorkflowStatus.CANCELLED) {
            throw new Error('Workflow cancelled');
          }
        }
      }

      // Create checkpoint if enabled
      if (this.options.enableCheckpointing) {
        await this.createCheckpoint(execution);
      }
    }

    // Update context
    context.status = ContextStatus.COMPLETED;

    return results;
  }

  private async executeParallelPhase(
    stageIds: StageId[],
    executable: ExecutableWorkflow,
    context: WorkflowContext,
    execution: WorkflowExecution
  ): Promise<any[]> {
    const promises = stageIds.map((stageId) =>
      this.executeStage(stageId, executable, context, execution)
    );

    return Promise.all(promises);
  }

  private async executeStage(
    stageId: StageId,
    executable: ExecutableWorkflow,
    context: WorkflowContext,
    execution: WorkflowExecution
  ): Promise<StageResult> {
    const stage = executable.stages.get(stageId);

    if (!stage) {
      throw new Error(`Stage ${stageId} not found in executable workflow`);
    }

    // Emit stage started event
    this.emitWorkflowEvent({
      type: 'stage:started',
      workflowId: execution.workflowId,
      executionId: execution.id,
      stageId,
      timestamp: new Date(),
    });

    // Update current stage in context
    context.currentStage = stageId;

    try {
      // Validate stage inputs
      const validationResult = stage.validate(context);
      if (!validationResult.valid) {
        throw new Error(
          `Stage validation failed: ${validationResult.errors
            .map((e) => e.message)
            .join(', ')}`
        );
      }

      // Execute stage with retry logic
      const result = await this.executeWithRetry(
        () => stage.execute(context),
        stageId,
        execution
      );

      // Store result in context
      context.results.set(stageId, result);

      // Emit stage completed event
      this.emitWorkflowEvent({
        type: 'stage:completed',
        workflowId: execution.workflowId,
        executionId: execution.id,
        stageId,
        timestamp: new Date(),
        data: result,
      });

      // Update task state in EventDrivenStateManager
      await this.updateTaskState(execution.workflowId, stageId, TaskStatus.COMPLETED, result);

      return result;
    } catch (error) {
      const workflowError: WorkflowError = {
        code: 'STAGE_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        stage: stageId,
        timestamp: new Date(),
        stack: error instanceof Error ? error.stack : undefined,
      };

      // Add error to context
      context.errors.push(workflowError);

      // Emit stage failed event
      this.emitWorkflowEvent({
        type: 'stage:failed',
        workflowId: execution.workflowId,
        executionId: execution.id,
        stageId,
        timestamp: new Date(),
        data: workflowError,
      });

      // Update task state in EventDrivenStateManager
      await this.updateTaskState(execution.workflowId, stageId, TaskStatus.FAILED, null, workflowError);

      // Determine if error is recoverable
      const stageData = executable.stages.get(stageId);
      if (stageData && workflowError.retryable) {
        // Will be retried
        throw error;
      }

      // Non-retryable error
      throw workflowError;
    }
  }

  private async executeWithRetry(
    fn: () => Promise<StageResult>,
    stageId: StageId,
    execution: WorkflowExecution
  ): Promise<StageResult> {
    const maxRetries = 3; // Could be configured per stage
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Record retry metric
        if (this.metricsCollector) {
          this.metricsCollector.recordRetry(execution.workflowId, stageId, attempt);
        }
      }
    }

    throw lastError;
  }

  // =====================
  // State Management Integration
  // =====================

  private async initializeWorkflowState(
    workflowId: WorkflowId,
    executionId: string,
    context: WorkflowContext
  ): Promise<void> {
    const command: Command = {
      id: uuidv4(),
      type: 'CreateWorkflow',
      metadata: {
        correlationId: uuidv4(),
        timestamp: new Date(),
      },
      timestamp: new Date(),
      payload: {
        workflowId,
        executionId,
        name: workflowId,
        description: `Workflow execution ${executionId}`,
        status: WorkflowStatus.INITIALIZING,
        context: Object.fromEntries(context.variables),
        variables: Object.fromEntries(context.variables),
      },
    };

    await this.options.stateManager.executeCommand(command);
  }

  private async updateWorkflowState(
    workflowId: WorkflowId,
    executionId: string,
    status: WorkflowStatus,
    error?: WorkflowError
  ): Promise<void> {
    const command: Command = {
      id: uuidv4(),
      type: 'UpdateWorkflowStatus',
      metadata: {
        correlationId: uuidv4(),
        timestamp: new Date(),
      },
      timestamp: new Date(),
      payload: {
        workflowId,
        executionId,
        status,
        error: error ? {
          code: error.code,
          message: error.message,
          timestamp: error.timestamp,
        } : undefined,
        updatedAt: new Date(),
      },
    };

    await this.options.stateManager.executeCommand(command);
  }

  private async updateTaskState(
    workflowId: WorkflowId,
    taskId: string,
    status: TaskStatus,
    result?: any,
    error?: WorkflowError
  ): Promise<void> {
    const command: Command = {
      id: uuidv4(),
      type: 'UpdateTaskStatus',
      metadata: {
        correlationId: uuidv4(),
        timestamp: new Date(),
      },
      timestamp: new Date(),
      payload: {
        workflowId,
        taskId,
        status,
        output: result?.output,
        error: error ? {
          code: error.code,
          message: error.message,
        } : undefined,
        completedAt: status === TaskStatus.COMPLETED ? new Date() : undefined,
      },
    };

    await this.options.stateManager.executeCommand(command);
  }

  // =====================
  // Plugin Integration
  // =====================

  private async executeTaskWithPlugin(
    task: TaskStage,
    context: WorkflowContext,
    execution: WorkflowExecution
  ): Promise<any> {
    const { pluginManager } = this.options;

    if (!pluginManager) {
      throw new Error('Plugin manager not configured');
    }

    // Prepare input
    const input = typeof task.input === 'string'
      ? this.evaluateExpression(task.input, context)
      : task.input;

    // Execute through plugin manager
    const plugin = await pluginManager.getAgent(task.agent, task.complexity);
    if (!plugin) {
      throw new Error(`Agent ${task.agent} not found`);
    }

    const result = await plugin.execute({
      complexity: task.complexity,
      input,
      context: Object.fromEntries(context.variables),
      workflowId: execution.workflowId,
      executionId: execution.id,
    });

    // Apply output transformation if specified
    if (task.output) {
      const transformedOutput = task.output.transform
        ? this.evaluateExpression(task.output.transform, { ...context, output: result })
        : result;

      context.variables.set(task.output.variable, transformedOutput);
    }

    return result;
  }

  // =====================
  // Checkpointing
  // =====================

  private async createCheckpoint(execution: WorkflowExecution): Promise<void> {
    const checkpoint = {
      id: uuidv4(),
      executionId: execution.id,
      workflowId: execution.workflowId,
      timestamp: new Date(),
      context: this.serializeContext(execution.context),
      stageId: execution.context.currentStage,
    };

    // Store checkpoint via state manager
    const command: Command = {
      id: uuidv4(),
      type: 'CreateCheckpoint',
      metadata: {
        correlationId: uuidv4(),
        timestamp: new Date(),
      },
      timestamp: new Date(),
      payload: checkpoint,
    };

    await this.options.stateManager.executeCommand(command);

    // Add to context
    execution.context.checkpoints.push({
      id: checkpoint.id,
      stageId: checkpoint.stageId || '',
      timestamp: checkpoint.timestamp,
      state: checkpoint.context,
      resumable: true,
    });

    // Emit checkpoint event
    this.emitWorkflowEvent({
      type: 'checkpoint:created',
      workflowId: execution.workflowId,
      executionId: execution.id,
      timestamp: checkpoint.timestamp,
      data: checkpoint,
    });
  }

  private async restoreFromCheckpoint(
    checkpointId: string
  ): Promise<WorkflowExecution | null> {
    // Query checkpoint from state manager
    const query = {
      id: uuidv4(),
      type: 'GetCheckpoint',
      criteria: { checkpointId },
      metadata: {
        correlationId: uuidv4(),
      },
    };

    const result = await this.options.stateManager.executeQuery(query);

    if (!result || !result.data) {
      return null;
    }

    const checkpoint = result.data;

    // Find original execution
    const execution = this.executions.get(checkpoint.executionId);

    if (!execution) {
      return null;
    }

    // Restore context
    execution.context = this.deserializeContext(checkpoint.context);

    // Emit checkpoint restored event
    this.emitWorkflowEvent({
      type: 'checkpoint:restored',
      workflowId: execution.workflowId,
      executionId: execution.id,
      timestamp: new Date(),
      data: checkpoint,
    });

    return execution;
  }

  // =====================
  // Workflow Control
  // =====================

  public async pause(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    execution.status = WorkflowStatus.PAUSED;

    await this.updateWorkflowState(
      execution.workflowId,
      executionId,
      WorkflowStatus.PAUSED
    );
  }

  public async resume(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.status !== WorkflowStatus.PAUSED) {
      throw new Error('Workflow is not paused');
    }

    execution.status = WorkflowStatus.RUNNING;

    await this.updateWorkflowState(
      execution.workflowId,
      executionId,
      WorkflowStatus.RUNNING
    );

    // Continue execution
    await this.executeWorkflow(execution);
  }

  public async cancel(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    execution.status = WorkflowStatus.CANCELLED;
    execution.completedAt = new Date();

    await this.updateWorkflowState(
      execution.workflowId,
      executionId,
      WorkflowStatus.CANCELLED
    );

    // Emit cancellation event
    this.emitWorkflowEvent({
      type: 'workflow:cancelled',
      workflowId: execution.workflowId,
      executionId,
      timestamp: execution.completedAt,
    });
  }

  // =====================
  // Event Handling
  // =====================

  private setupEventHandlers(): void {
    // Subscribe to state manager events
    if (this.options.stateManager) {
      const eventBus = (this.options.stateManager as any).eventBus;

      if (eventBus) {
        eventBus.subscribe('WorkflowCreated', (event: any) => {
          this.handleWorkflowCreated(event);
        });

        eventBus.subscribe('TaskCompleted', (event: any) => {
          this.handleTaskCompleted(event);
        });

        eventBus.subscribe('WorkflowCompleted', (event: any) => {
          this.handleWorkflowCompleted(event);
        });
      }
    }
  }

  private handleWorkflowCreated(event: any): void {
    // Handle workflow created events from state manager
    console.log('Workflow created:', event);
  }

  private handleTaskCompleted(event: any): void {
    // Handle task completed events from state manager
    console.log('Task completed:', event);
  }

  private handleWorkflowCompleted(event: any): void {
    // Handle workflow completed events from state manager
    console.log('Workflow completed:', event);
  }

  private emitWorkflowEvent(event: WorkflowEvent): void {
    this.emit(event.type, event);

    // Record metrics if enabled
    if (this.metricsCollector) {
      this.metricsCollector.recordEvent(event);
    }
  }

  // =====================
  // Helper Methods
  // =====================

  private evaluateExpression(expression: string, context: any): any {
    try {
      const func = new Function('context', `with(context) { return ${expression}; }`);
      return func(context);
    } catch (error) {
      console.error(`Failed to evaluate expression: ${expression}`, error);
      return undefined;
    }
  }

  private serializeContext(context: WorkflowContext): any {
    return {
      workflowId: context.workflowId,
      executionId: context.executionId,
      variables: Array.from(context.variables.entries()),
      results: Array.from(context.results.entries()),
      metadata: context.metadata,
      currentStage: context.currentStage,
      status: context.status,
      errors: context.errors,
    };
  }

  private deserializeContext(data: any): WorkflowContext {
    return {
      workflowId: data.workflowId,
      executionId: data.executionId,
      variables: new Map(data.variables),
      results: new Map(data.results),
      metadata: data.metadata,
      startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
      checkpoints: data.checkpoints || [],
      currentStage: data.currentStage,
      status: data.status,
      errors: data.errors || [],
    };
  }

  // =====================
  // Query Methods
  // =====================

  public getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  public getActiveExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values()).filter(
      (e) => e.status === WorkflowStatus.RUNNING || e.status === WorkflowStatus.PAUSED
    );
  }

  public getMetrics(): ExecutionMetrics | undefined {
    return this.metricsCollector?.getMetrics();
  }
}

// =====================
// Metrics Collection
// =====================

class MetricsCollector {
  private metrics: Map<string, ExecutionMetrics>;

  constructor() {
    this.metrics = new Map();
  }

  public recordEvent(event: WorkflowEvent): void {
    // Record various metrics based on event type
    const metrics = this.getOrCreateMetrics(event.executionId);

    switch (event.type) {
      case 'stage:completed':
        if (event.data?.duration) {
          metrics.stageDurations.set(event.stageId!, event.data.duration);
        }
        break;

      case 'workflow:completed':
        metrics.totalDuration = event.data?.duration || 0;
        break;

      case 'workflow:failed':
        metrics.errorRate++;
        break;
    }
  }

  public recordRetry(workflowId: string, stageId: string, attempt: number): void {
    const metrics = this.getOrCreateMetrics(workflowId);
    metrics.stageRetries.set(stageId, attempt);
  }

  private getOrCreateMetrics(id: string): ExecutionMetrics {
    if (!this.metrics.has(id)) {
      this.metrics.set(id, {
        totalDuration: 0,
        stageDurations: new Map(),
        stageRetries: new Map(),
        memoryUsage: 0,
        cpuUsage: 0,
        throughput: 0,
        errorRate: 0,
      });
    }

    return this.metrics.get(id)!;
  }

  public getMetrics(): ExecutionMetrics | undefined {
    // Return aggregated metrics
    const allMetrics = Array.from(this.metrics.values());

    if (allMetrics.length === 0) {
      return undefined;
    }

    return {
      totalDuration: allMetrics.reduce((sum, m) => sum + m.totalDuration, 0) / allMetrics.length,
      stageDurations: new Map(),
      stageRetries: new Map(),
      memoryUsage: process.memoryUsage().heapUsed,
      cpuUsage: 0, // Would need to implement CPU tracking
      throughput: allMetrics.length,
      errorRate: allMetrics.reduce((sum, m) => sum + m.errorRate, 0) / allMetrics.length,
    };
  }
}