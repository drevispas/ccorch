import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { Observable, Subject, BehaviorSubject, filter, map, debounceTime, distinctUntilChanged } from 'rxjs';
import { EventBus, EventSubscription } from './events/event-bus';
import {
  OrchestratorState,
  WorkflowState,
  TaskState,
  AgentState,
  StateEvent,
  Command,
  Query,
  QueryResult,
  WorkflowId,
  TaskId,
  AgentName,
  CorrelationId,
  WorkflowStatus,
  TaskStatus,
  AgentStatus,
  SystemMetrics,
  StateSnapshot,
  PriorityQueue,
  ComplexityLevel
} from './types';

export interface StateManagerConfig {
  enableEventSourcing?: boolean;
  enableSnapshots?: boolean;
  snapshotInterval?: number;
  maxEventHistory?: number;
  persistenceEnabled?: boolean;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  enableMetrics?: boolean;
  enableLogging?: boolean;
  logLevel?: string;
}

export interface StateChangeEvent {
  type: 'workflow' | 'task' | 'agent' | 'global';
  operation: 'create' | 'update' | 'delete';
  entityId: string;
  previousState?: any;
  currentState: any;
  metadata: Record<string, any>;
}

export class EventDrivenStateManager {
  private state: OrchestratorState;
  private stateSubject: BehaviorSubject<OrchestratorState>;
  private changeSubject: Subject<StateChangeEvent>;
  private eventBus: EventBus;
  private config: StateManagerConfig;
  private logger: winston.Logger;
  private commandHandlers: Map<string, CommandHandler>;
  private queryHandlers: Map<string, QueryHandler>;
  private eventHandlers: Map<string, EventHandler>;
  private subscriptions: EventSubscription[] = [];
  private snapshotTimer?: NodeJS.Timeout;
  private eventCounter = 0;
  private lastSnapshotVersion = 0;

  constructor(config: StateManagerConfig = {}) {
    this.config = {
      enableEventSourcing: true,
      enableSnapshots: true,
      snapshotInterval: 100,
      maxEventHistory: 10000,
      persistenceEnabled: true,
      cacheEnabled: true,
      cacheTTL: 60000,
      enableMetrics: true,
      enableLogging: true,
      logLevel: 'info',
      ...config
    };

    this.state = this.initializeState();
    this.stateSubject = new BehaviorSubject(this.state);
    this.changeSubject = new Subject();

    this.eventBus = new EventBus({
      enableLogging: this.config.enableLogging,
      enableMetrics: this.config.enableMetrics
    });

    this.logger = winston.createLogger({
      level: this.config.logLevel,
      format: winston.format.json(),
      defaultMeta: { service: 'EventDrivenStateManager' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    this.commandHandlers = new Map();
    this.queryHandlers = new Map();
    this.eventHandlers = new Map();

    this.registerDefaultHandlers();
    this.subscribeToEvents();

    if (this.config.enableSnapshots) {
      this.scheduleSnapshots();
    }
  }

  private initializeState(): OrchestratorState {
    return {
      workflows: new Map(),
      activeWorkflows: new Set(),
      completedWorkflows: new Set(),
      taskQueue: new PriorityQueue<TaskState>(),
      agentPool: new Map(),
      globalContext: {},
      metrics: this.createInitialMetrics()
    };
  }

  private createInitialMetrics(): SystemMetrics {
    return {
      totalWorkflows: 0,
      activeWorkflows: 0,
      completedWorkflows: 0,
      failedWorkflows: 0,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageWorkflowDuration: 0,
      averageTaskDuration: 0,
      agentUtilization: new Map(),
      errorRate: 0,
      throughput: 0,
      lastUpdated: new Date()
    };
  }

  private registerDefaultHandlers(): void {
    this.registerCommandHandlers();
    this.registerQueryHandlers();
    this.registerEventHandlers();
  }

  private registerCommandHandlers(): void {
    this.registerCommandHandler('CreateWorkflow', new CreateWorkflowHandler(this));
    this.registerCommandHandler('UpdateWorkflowStatus', new UpdateWorkflowStatusHandler(this));
    this.registerCommandHandler('CreateTask', new CreateTaskHandler(this));
    this.registerCommandHandler('UpdateTaskStatus', new UpdateTaskStatusHandler(this));
    this.registerCommandHandler('AssignAgent', new AssignAgentHandler(this));
    this.registerCommandHandler('UpdateAgentStatus', new UpdateAgentStatusHandler(this));
    this.registerCommandHandler('CompleteWorkflow', new CompleteWorkflowHandler(this));
    this.registerCommandHandler('FailWorkflow', new FailWorkflowHandler(this));
    this.registerCommandHandler('CancelWorkflow', new CancelWorkflowHandler(this));
    this.registerCommandHandler('UPDATE_EXECUTION_STATE', new UpdateExecutionStateHandler(this));
  }

  private registerQueryHandlers(): void {
    this.registerQueryHandler('GetWorkflow', new GetWorkflowHandler(this));
    this.registerQueryHandler('GetTask', new GetTaskHandler(this));
    this.registerQueryHandler('GetAgent', new GetAgentHandler(this));
    this.registerQueryHandler('GetActiveWorkflows', new GetActiveWorkflowsHandler(this));
    this.registerQueryHandler('GetTaskQueue', new GetTaskQueueHandler(this));
    this.registerQueryHandler('GetMetrics', new GetMetricsHandler(this));
    this.registerQueryHandler('GetWorkflowsByStatus', new GetWorkflowsByStatusHandler(this));
    this.registerQueryHandler('GetAgentUtilization', new GetAgentUtilizationHandler(this));
  }

  private registerEventHandlers(): void {
    this.subscriptions.push(
      this.eventBus.subscribe('WorkflowCreated', this.handleWorkflowCreated.bind(this)),
      this.eventBus.subscribe('WorkflowStatusUpdated', this.handleWorkflowStatusUpdated.bind(this)),
      this.eventBus.subscribe('TaskCreated', this.handleTaskCreated.bind(this)),
      this.eventBus.subscribe('TaskStatusUpdated', this.handleTaskStatusUpdated.bind(this)),
      this.eventBus.subscribe('AgentAssigned', this.handleAgentAssigned.bind(this)),
      this.eventBus.subscribe('AgentStatusUpdated', this.handleAgentStatusUpdated.bind(this))
    );
  }

  private subscribeToEvents(): void {
    this.changeSubject
      .pipe(
        debounceTime(100),
        distinctUntilChanged((prev, curr) =>
          prev.entityId === curr.entityId && prev.operation === curr.operation
        )
      )
      .subscribe(change => {
        this.logger.debug('State change detected:', change);
        this.updateMetrics();
      });
  }

  private scheduleSnapshots(): void {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
    }

    this.snapshotTimer = setInterval(() => {
      if (this.eventCounter >= this.config.snapshotInterval!) {
        this.createSnapshot('Scheduled snapshot');
      }
    }, 60000);
    // Allow process to exit even if this timer is running
    (this.snapshotTimer as any).unref?.();
  }

  public async executeCommand(command: Command): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.info(`Executing command: ${command.type}`, {
        commandId: command.id,
        correlationId: command.metadata.correlationId
      });

      const handler = this.commandHandlers.get(command.type);
      if (!handler) {
        throw new Error(`No handler registered for command type: ${command.type}`);
      }

      await handler.handle(command);

      const event: StateEvent = {
        id: uuidv4(),
        correlationId: command.metadata.correlationId,
        type: `${command.type}Executed`,
        payload: command.payload,
        metadata: {
          source: 'StateManager',
          commandId: command.id,
          workflowId: command.metadata.workflowId,
          version: '2.0.0',
          executionTime: Date.now() - startTime
        },
        timestamp: new Date()
      };

      await this.eventBus.publish(event);
      this.eventCounter++;

      if (this.config.enableSnapshots && this.eventCounter % this.config.snapshotInterval! === 0) {
        await this.createSnapshot(`After command: ${command.type}`);
      }
    } catch (error) {
      this.logger.error(`Command execution failed: ${command.type}`, error);
      throw error;
    }
  }

  public async executeQuery(query: Query): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      this.logger.debug(`Executing query: ${query.type}`, {
        queryId: query.id,
        correlationId: query.metadata.correlationId
      });

      const handler = this.queryHandlers.get(query.type);
      if (!handler) {
        throw new Error(`No handler registered for query type: ${query.type}`);
      }

      const result = await handler.handle(query);

      return {
        data: result,
        metadata: {
          queryId: query.id,
          timestamp: new Date(),
          cached: false,
          executionTime: Date.now() - startTime
        }
      };
    } catch (error) {
      this.logger.error(`Query execution failed: ${query.type}`, error);
      throw error;
    }
  }

  public registerCommandHandler(type: string, handler: CommandHandler): void {
    this.commandHandlers.set(type, handler);
    this.logger.debug(`Registered command handler: ${type}`);
  }

  public registerQueryHandler(type: string, handler: QueryHandler): void {
    this.queryHandlers.set(type, handler);
    this.logger.debug(`Registered query handler: ${type}`);
  }

  public registerEventHandler(type: string, handler: EventHandler): void {
    this.eventHandlers.set(type, handler);
    this.logger.debug(`Registered event handler: ${type}`);
  }

  public getState(): OrchestratorState {
    return this.state;
  }

  public getStateObservable(): Observable<OrchestratorState> {
    return this.stateSubject.asObservable();
  }

  public getChangeObservable(): Observable<StateChangeEvent> {
    return this.changeSubject.asObservable();
  }

  public get events$(): Observable<StateChangeEvent> {
    return this.changeSubject.asObservable();
  }

  public getWorkflowObservable(workflowId: WorkflowId): Observable<WorkflowState | undefined> {
    return this.stateSubject.pipe(
      map(state => state.workflows.get(workflowId)),
      distinctUntilChanged((prev, curr) => {
        if (prev === curr) return true;
        if (!prev || !curr) return false;
        return prev.status === curr.status &&
               prev.lastModifiedAt?.getTime() === curr.lastModifiedAt?.getTime();
      })
    );
  }

  public getTaskObservable(taskId: TaskId): Observable<TaskState | undefined> {
    return this.stateSubject.pipe(
      map(state => {
        for (const workflow of state.workflows.values()) {
          const task = workflow.tasks.get(taskId);
          if (task) return task;
        }
        return undefined;
      }),
      distinctUntilChanged()
    );
  }

  public getAgentObservable(agentName: AgentName): Observable<AgentState | undefined> {
    return this.stateSubject.pipe(
      map(state => state.agentPool.get(agentName)),
      distinctUntilChanged()
    );
  }

  public getMetricsObservable(): Observable<SystemMetrics> {
    return this.stateSubject.pipe(
      map(state => state.metrics),
      distinctUntilChanged((prev, curr) =>
        prev.totalWorkflows === curr.totalWorkflows &&
        prev.activeWorkflows === curr.activeWorkflows &&
        prev.completedWorkflows === curr.completedWorkflows &&
        prev.failedWorkflows === curr.failedWorkflows &&
        prev.totalTasks === curr.totalTasks &&
        prev.completedTasks === curr.completedTasks &&
        prev.failedTasks === curr.failedTasks
      )
    );
  }

  private async createSnapshot(reason: string): Promise<StateSnapshot> {
    const snapshot: StateSnapshot = {
      id: uuidv4(),
      state: JSON.parse(JSON.stringify(this.state, this.stateSerializer)),
      version: ++this.lastSnapshotVersion,
      createdAt: new Date(),
      metadata: {
        reason,
        automated: true,
        compressed: false,
        checksum: this.calculateChecksum(this.state),
        sizeBytes: JSON.stringify(this.state).length
      }
    };

    this.logger.info(`Created snapshot: ${snapshot.id}`, {
      version: snapshot.version,
      reason,
      size: snapshot.metadata.sizeBytes
    });

    this.eventCounter = 0;

    return snapshot;
  }

  private stateSerializer(key: string, value: any): any {
    if (value instanceof Map) {
      return {
        _type: 'Map',
        entries: Array.from(value.entries())
      };
    }
    if (value instanceof Set) {
      return {
        _type: 'Set',
        values: Array.from(value.values())
      };
    }
    if (value instanceof Date) {
      return {
        _type: 'Date',
        value: value.toISOString()
      };
    }
    if (value instanceof PriorityQueue) {
      return {
        _type: 'PriorityQueue',
        items: value.toArray()
      };
    }
    return value;
  }

  private calculateChecksum(state: any): string {
    const crypto = require('crypto');
    const json = JSON.stringify(state, this.stateSerializer);
    return crypto.createHash('sha256').update(json).digest('hex');
  }

  private updateMetrics(): void {
    const metrics = this.state.metrics;
    const workflows = Array.from(this.state.workflows.values());

    metrics.totalWorkflows = workflows.length;
    metrics.activeWorkflows = this.state.activeWorkflows.size;
    metrics.completedWorkflows = this.state.completedWorkflows.size;
    metrics.failedWorkflows = workflows.filter(w => w.status === WorkflowStatus.FAILED).length;

    let totalTasks = 0;
    let completedTasks = 0;
    let failedTasks = 0;

    workflows.forEach(workflow => {
      const tasks = Array.from(workflow.tasks.values());
      totalTasks += tasks.length;
      completedTasks += tasks.filter(t => t.status === TaskStatus.COMPLETED).length;
      failedTasks += tasks.filter(t => t.status === TaskStatus.FAILED).length;
    });

    metrics.totalTasks = totalTasks;
    metrics.completedTasks = completedTasks;
    metrics.failedTasks = failedTasks;

    if (metrics.failedWorkflows + metrics.completedWorkflows > 0) {
      metrics.errorRate = metrics.failedWorkflows / (metrics.failedWorkflows + metrics.completedWorkflows);
    }

    metrics.lastUpdated = new Date();

    this.stateSubject.next(this.state);
  }

  private handleWorkflowCreated(event: StateEvent): void {
    const workflow = event.payload as WorkflowState;
    this.state.workflows.set(workflow.id, workflow);
    this.state.activeWorkflows.add(workflow.id);

    this.changeSubject.next({
      type: 'workflow',
      operation: 'create',
      entityId: workflow.id,
      currentState: workflow,
      metadata: event.metadata
    });

    // Update metrics immediately for workflow creation
    this.updateMetrics();
  }

  private handleWorkflowStatusUpdated(event: StateEvent): void {
    const { workflowId, status } = event.payload;
    const workflow = this.state.workflows.get(workflowId);

    if (workflow) {
      const previousStatus = workflow.status;
      workflow.status = status;
      workflow.lastModifiedAt = new Date();

      // Handle status transitions
      if (status === WorkflowStatus.RUNNING) {
        // When moving to RUNNING, ensure it's in activeWorkflows
        this.state.activeWorkflows.add(workflowId);
        this.state.completedWorkflows.delete(workflowId);
      } else if (status === WorkflowStatus.COMPLETED || status === WorkflowStatus.FAILED || status === WorkflowStatus.CANCELLED) {
        // When workflow is completed/failed/cancelled, move from active to completed
        this.state.activeWorkflows.delete(workflowId);
        this.state.completedWorkflows.add(workflowId);
        workflow.completedAt = new Date();
      }

      this.changeSubject.next({
        type: 'workflow',
        operation: 'update',
        entityId: workflowId,
        previousState: { status: previousStatus },
        currentState: { status },
        metadata: event.metadata
      });

      // Update metrics immediately for status changes
      this.updateMetrics();
    }
  }

  private handleTaskCreated(event: StateEvent): void {
    const { workflowId, task } = event.payload;
    const workflow = this.state.workflows.get(workflowId);

    if (workflow) {
      workflow.tasks.set(task.id, task);
      workflow.taskOrder.push(task.id);
      this.state.taskQueue.enqueue(task, task.priority);

      this.changeSubject.next({
        type: 'task',
        operation: 'create',
        entityId: task.id,
        currentState: task,
        metadata: { ...event.metadata, workflowId }
      });
    }
  }

  private handleTaskStatusUpdated(event: StateEvent): void {
    const { taskId, status, output, error } = event.payload;

    for (const workflow of this.state.workflows.values()) {
      const task = workflow.tasks.get(taskId);
      if (task) {
        const previousStatus = task.status;
        task.status = status;

        if (output !== undefined) {
          task.output = output;
        }
        if (error !== undefined) {
          task.error = error;
        }

        if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
          task.completedAt = new Date();
        }

        this.changeSubject.next({
          type: 'task',
          operation: 'update',
          entityId: taskId,
          previousState: { status: previousStatus },
          currentState: { status },
          metadata: { ...event.metadata, workflowId: workflow.id }
        });
        break;
      }
    }
  }

  private handleAgentAssigned(event: StateEvent): void {
    const { agentName, taskId, workflowId } = event.payload;
    let agent = this.state.agentPool.get(agentName);

    if (!agent) {
      agent = this.createDefaultAgent(agentName);
      this.state.agentPool.set(agentName, agent);
    }

    agent.currentTaskId = taskId;
    agent.status = AgentStatus.EXECUTING;
    agent.lastActiveAt = new Date();

    this.changeSubject.next({
      type: 'agent',
      operation: 'update',
      entityId: agentName,
      currentState: agent,
      metadata: { ...event.metadata, taskId, workflowId }
    });
  }

  private handleAgentStatusUpdated(event: StateEvent): void {
    const { agentName, status } = event.payload;
    const agent = this.state.agentPool.get(agentName);

    if (agent) {
      const previousStatus = agent.status;
      agent.status = status;
      agent.lastActiveAt = new Date();

      if (status === AgentStatus.COMPLETED) {
        agent.executionCount++;
        agent.successCount++;
        agent.currentTaskId = undefined;
      } else if (status === AgentStatus.FAILED) {
        agent.executionCount++;
        agent.failureCount++;
        agent.currentTaskId = undefined;
      }

      this.changeSubject.next({
        type: 'agent',
        operation: 'update',
        entityId: agentName,
        previousState: { status: previousStatus },
        currentState: { status },
        metadata: event.metadata
      });
    }
  }

  private createDefaultAgent(name: AgentName): AgentState {
    return {
      name,
      complexity: ComplexityLevel.MODERATE,
      status: AgentStatus.IDLE,
      capabilities: [],
      version: '1.0.0',
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
      averageExecutionTime: 0,
      metadata: {}
    };
  }

  public async initialize(): Promise<void> {
    this.logger.info('EventDrivenStateManager initialized');
  }

  public async updateWorkflowStatus(workflowId: string, status: WorkflowStatus): Promise<void> {
    const workflow = this.state.workflows.get(workflowId);
    if (workflow) {
      workflow.status = status;
      workflow.updatedAt = new Date();

      this.changeSubject.next({
        type: 'workflow',
        operation: 'update',
        entityId: workflowId,
        currentState: workflow,
        metadata: { workflowId }
      });
    }
  }

  public async destroy(): Promise<void> {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
    }

    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.changeSubject.complete();
    this.stateSubject.complete();
    await this.eventBus.destroy();

    this.logger.info('EventDrivenStateManager destroyed');
  }

  // CRUD Methods for workflows
  async listWorkflows(): Promise<WorkflowState[]> {
    const state = this.getState();
    return Array.from(state.workflows.values());
  }

  async getWorkflow(id: WorkflowId): Promise<WorkflowState | null> {
    const state = this.getState();
    return state.workflows.get(id) || null;
  }

  async createWorkflow(workflow: WorkflowState): Promise<void> {
    await this.executeCommand({
      id: uuidv4(),
      type: 'CreateWorkflow',
      payload: workflow,
      metadata: {
        correlationId: uuidv4(),
        timestamp: new Date()
      },
      timestamp: new Date()
    });
  }

  async updateWorkflow(id: WorkflowId, updates: Partial<WorkflowState>): Promise<void> {
    await this.executeCommand({
      id: uuidv4(),
      type: 'UpdateWorkflow',
      payload: { workflowId: id, updates },
      metadata: {
        correlationId: uuidv4(),
        timestamp: new Date()
      },
      timestamp: new Date()
    });
  }

  async deleteWorkflow(id: WorkflowId): Promise<void> {
    await this.executeCommand({
      id: uuidv4(),
      type: 'DeleteWorkflow',
      payload: { workflowId: id },
      metadata: {
        correlationId: uuidv4(),
        timestamp: new Date()
      },
      timestamp: new Date()
    });
  }

  // CRUD Methods for tasks
  async getTasksByWorkflow(workflowId: WorkflowId): Promise<TaskState[]> {
    const workflow = await this.getWorkflow(workflowId);
    return workflow ? Array.from(workflow.tasks.values()) : [];
  }

  async getTask(taskId: TaskId): Promise<TaskState | null> {
    const state = this.getState();
    // Search through all workflows for the task
    for (const workflow of state.workflows.values()) {
      const task = workflow.tasks.get(taskId);
      if (task) return task;
    }
    return null;
  }

  async updateTask(taskId: TaskId, updates: Partial<TaskState>): Promise<void> {
    await this.executeCommand({
      id: uuidv4(),
      type: 'UpdateTask',
      payload: { taskId, updates },
      metadata: {
        correlationId: uuidv4(),
        timestamp: new Date()
      },
      timestamp: new Date()
    });
  }

  async updateTaskStatus(taskId: TaskId, status: TaskStatus): Promise<void> {
    await this.updateTask(taskId, { status });
  }

  // Event listener method for integration
  on(event: string, listener: (...args: any[]) => void): void {
    this.eventBus.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    this.eventBus.off(event, listener);
  }

  // Shutdown method for proper cleanup
  async shutdown(): Promise<void> {
    await this.destroy();
  }
}

interface CommandHandler {
  handle(command: Command): Promise<void>;
}

interface QueryHandler {
  handle(query: Query): Promise<any>;
}

interface EventHandler {
  handle(event: StateEvent): void;
}

class CreateWorkflowHandler implements CommandHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(command: Command): Promise<void> {
    const workflow: WorkflowState = {
      id: command.payload.id || uuidv4(),
      name: command.payload.name,
      description: command.payload.description || '',
      status: WorkflowStatus.PENDING,
      tasks: new Map(),
      agents: new Map(),
      taskOrder: [],
      context: command.payload.context || {},
      variables: command.payload.variables || {},
      checkpoints: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastModifiedAt: new Date(),
      createdBy: command.metadata.userId || 'system',
      tags: command.payload.tags || [],
      metadata: command.payload.metadata || {}
    };

    await this.manager['eventBus'].publish({
      id: uuidv4(),
      correlationId: command.metadata.correlationId,
      type: 'WorkflowCreated',
      payload: workflow,
      metadata: {
        source: 'CreateWorkflowHandler',
        workflowId: workflow.id,
        version: '2.0.0'
      },
      timestamp: new Date()
    });
  }
}

class UpdateWorkflowStatusHandler implements CommandHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(command: Command): Promise<void> {
    const { workflowId, status } = command.payload;

    await this.manager['eventBus'].publish({
      id: uuidv4(),
      correlationId: command.metadata.correlationId,
      type: 'WorkflowStatusUpdated',
      payload: { workflowId, status },
      metadata: {
        source: 'UpdateWorkflowStatusHandler',
        workflowId,
        version: '2.0.0'
      },
      timestamp: new Date()
    });
  }
}

class CreateTaskHandler implements CommandHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(command: Command): Promise<void> {
    const task: TaskState = {
      id: command.payload.id || uuidv4(),
      workflowId: command.payload.workflowId,
      agentName: command.payload.agentName,
      complexity: command.payload.complexity || ComplexityLevel.MODERATE,
      status: TaskStatus.PENDING,
      description: command.payload.description,
      input: command.payload.input,
      retryCount: 0,
      maxRetries: command.payload.maxRetries || 3,
      timeout: command.payload.timeout || 30000,
      priority: command.payload.priority || 0,
      dependencies: command.payload.dependencies || [],
      createdAt: new Date(),
      metadata: command.payload.metadata || {}
    };

    await this.manager['eventBus'].publish({
      id: uuidv4(),
      correlationId: command.metadata.correlationId,
      type: 'TaskCreated',
      payload: { workflowId: task.workflowId, task },
      metadata: {
        source: 'CreateTaskHandler',
        workflowId: task.workflowId,
        taskId: task.id,
        version: '2.0.0'
      },
      timestamp: new Date()
    });
  }
}

class UpdateTaskStatusHandler implements CommandHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(command: Command): Promise<void> {
    const { taskId, status, output, error } = command.payload;

    await this.manager['eventBus'].publish({
      id: uuidv4(),
      correlationId: command.metadata.correlationId,
      type: 'TaskStatusUpdated',
      payload: { taskId, status, output, error },
      metadata: {
        source: 'UpdateTaskStatusHandler',
        taskId,
        version: '2.0.0'
      },
      timestamp: new Date()
    });
  }
}

class AssignAgentHandler implements CommandHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(command: Command): Promise<void> {
    const { agentName, taskId, workflowId } = command.payload;

    await this.manager['eventBus'].publish({
      id: uuidv4(),
      correlationId: command.metadata.correlationId,
      type: 'AgentAssigned',
      payload: { agentName, taskId, workflowId },
      metadata: {
        source: 'AssignAgentHandler',
        workflowId,
        taskId,
        agentName,
        version: '2.0.0'
      },
      timestamp: new Date()
    });
  }
}

class UpdateAgentStatusHandler implements CommandHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(command: Command): Promise<void> {
    const { agentName, status } = command.payload;

    await this.manager['eventBus'].publish({
      id: uuidv4(),
      correlationId: command.metadata.correlationId,
      type: 'AgentStatusUpdated',
      payload: { agentName, status },
      metadata: {
        source: 'UpdateAgentStatusHandler',
        agentName,
        version: '2.0.0'
      },
      timestamp: new Date()
    });
  }
}

class CompleteWorkflowHandler implements CommandHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(command: Command): Promise<void> {
    const { workflowId, result } = command.payload;

    await this.manager['eventBus'].publish({
      id: uuidv4(),
      correlationId: command.metadata.correlationId,
      type: 'WorkflowStatusUpdated',
      payload: { workflowId, status: WorkflowStatus.COMPLETED, result },
      metadata: {
        source: 'CompleteWorkflowHandler',
        workflowId,
        version: '2.0.0'
      },
      timestamp: new Date()
    });
  }
}

class FailWorkflowHandler implements CommandHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(command: Command): Promise<void> {
    const { workflowId, error } = command.payload;

    await this.manager['eventBus'].publish({
      id: uuidv4(),
      correlationId: command.metadata.correlationId,
      type: 'WorkflowStatusUpdated',
      payload: { workflowId, status: WorkflowStatus.FAILED, error },
      metadata: {
        source: 'FailWorkflowHandler',
        workflowId,
        version: '2.0.0'
      },
      timestamp: new Date()
    });
  }
}

class CancelWorkflowHandler implements CommandHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(command: Command): Promise<void> {
    const { workflowId, reason } = command.payload;

    await this.manager['eventBus'].publish({
      id: uuidv4(),
      correlationId: command.metadata.correlationId,
      type: 'WorkflowStatusUpdated',
      payload: { workflowId, status: WorkflowStatus.CANCELLED, reason },
      metadata: {
        source: 'CancelWorkflowHandler',
        workflowId,
        version: '2.0.0'
      },
      timestamp: new Date()
    });
  }
}

class UpdateExecutionStateHandler implements CommandHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(command: Command): Promise<void> {
    const { executionId, state, metadata } = command.payload;

    await this.manager['eventBus'].publish({
      id: uuidv4(),
      correlationId: command.metadata.correlationId,
      type: 'ExecutionStateUpdated',
      payload: { executionId, state, metadata },
      metadata: {
        source: 'UpdateExecutionStateHandler',
        workflowId: command.metadata.workflowId,
        version: '2.0.0'
      },
      timestamp: new Date()
    });
  }
}

class GetWorkflowHandler implements QueryHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(query: Query): Promise<WorkflowState | undefined> {
    const { workflowId } = query.criteria;
    return this.manager.getState().workflows.get(workflowId);
  }
}

class GetTaskHandler implements QueryHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(query: Query): Promise<TaskState | undefined> {
    const { taskId } = query.criteria;
    const state = this.manager.getState();

    for (const workflow of state.workflows.values()) {
      const task = workflow.tasks.get(taskId);
      if (task) return task;
    }

    return undefined;
  }
}

class GetAgentHandler implements QueryHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(query: Query): Promise<AgentState | undefined> {
    const { agentName } = query.criteria;
    return this.manager.getState().agentPool.get(agentName);
  }
}

class GetActiveWorkflowsHandler implements QueryHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(query: Query): Promise<WorkflowState[]> {
    const state = this.manager.getState();
    const activeWorkflows: WorkflowState[] = [];

    for (const workflowId of state.activeWorkflows) {
      const workflow = state.workflows.get(workflowId);
      if (workflow) {
        activeWorkflows.push(workflow);
      }
    }

    return activeWorkflows;
  }
}

class GetTaskQueueHandler implements QueryHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(query: Query): Promise<TaskState[]> {
    return this.manager.getState().taskQueue.toArray();
  }
}

class GetMetricsHandler implements QueryHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(query: Query): Promise<SystemMetrics> {
    return this.manager.getState().metrics;
  }
}

class GetWorkflowsByStatusHandler implements QueryHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(query: Query): Promise<WorkflowState[]> {
    const { status } = query.criteria;
    const state = this.manager.getState();
    const workflows: WorkflowState[] = [];

    for (const workflow of state.workflows.values()) {
      if (workflow.status === status) {
        workflows.push(workflow);
      }
    }

    return workflows;
  }
}

class GetAgentUtilizationHandler implements QueryHandler {
  constructor(private manager: EventDrivenStateManager) {}

  async handle(query: Query): Promise<Map<AgentName, number>> {
    const state = this.manager.getState();
    const utilization = new Map<AgentName, number>();

    for (const [name, agent] of state.agentPool) {
      const util = agent.status === AgentStatus.EXECUTING ? 1.0 :
                   agent.status === AgentStatus.READY ? 0.5 : 0.0;
      utilization.set(name, util);
    }

    return utilization;
  }
}