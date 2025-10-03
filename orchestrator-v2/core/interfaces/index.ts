/**
 * Core Interfaces for Orchestrator V2
 *
 * This module defines the missing interfaces that should be implemented
 * by various classes throughout the application for better abstraction,
 * testability, and maintainability.
 */

import { EventEmitter } from 'events';
import { Observable } from 'rxjs';
import {
  WorkflowId,
  TaskId,
  WorkflowStatus,
  TaskStatus,
  AgentType,
  WorkflowType,
  ComplexityLevel,
  Todo
} from '../../server/schemas/common';
import { WorkflowState, PendingTask, TaskParams } from '../../server/types';
import { StateEvent, WorkflowState as CoreWorkflowState, TaskState, AgentState } from '../state/types';
import { ComplexityAnalysis } from '../complexity-detector';
import { ParsedCommand } from '../command-parser';
import {
  LogMetadata,
  Command,
  Query,
  QueryResult,
  SystemState,
  AgentResult,
  TaskResult,
  WorkflowResult,
  OrchestratorConfig,
  WorkflowDefinition,
  AgentDefinition,
  PluginInstance,
  ApiConfig,
  StorageData,
  CacheEntry,
  ErrorContext,
  HandlerContext
} from '../types/common.types';

// ============================================================================
// Logger Interfaces
// ============================================================================

/**
 * Generic logger interface for consistent logging across the application
 */
export interface ILogger {
  debug(message: string, meta?: LogMetadata): void;
  info(message: string, meta?: LogMetadata): void;
  warn(message: string, meta?: LogMetadata): void;
  error(message: string, meta?: LogMetadata): void;
  fatal(message: string, meta?: LogMetadata): void;
}

/**
 * Application-specific logger with context support
 */
export interface IServerLogger extends ILogger {
  initialize(): Promise<void>;
  logRequest(method: string, path: string, correlationId?: string): void;
  logResponse(method: string, path: string, statusCode: number, duration: number, correlationId?: string): void;
  logWithContext(level: string, context: string, message: string, metadata?: LogMetadata): void;
  workflowStarted(workflowId: WorkflowId, workflowType: string, taskDescription: string): void;
  workflowCompleted(workflowId: WorkflowId, duration: number): void;
  taskCreated(taskId: TaskId, agentType: AgentType, workflowId: WorkflowId): void;
  taskCompleted(taskId: TaskId, duration: number, success: boolean): void;
  getMetrics(): Map<string, number>;
}

// ============================================================================
// Manager Interfaces
// ============================================================================

/**
 * Workflow manager interface
 */
export interface IWorkflowManager {
  createWorkflow(command: ParsedCommand): Promise<WorkflowId>;
  executeWorkflow(workflowId: WorkflowId): Promise<void>;
  pauseWorkflow(workflowId: WorkflowId): Promise<void>;
  resumeWorkflow(workflowId: WorkflowId): Promise<void>;
  cancelWorkflow(workflowId: WorkflowId): Promise<void>;
  getWorkflow(workflowId: WorkflowId): Promise<WorkflowState | null>;
  listWorkflows(filter?: Partial<WorkflowState>): Promise<WorkflowState[]>;
}

/**
 * Task manager interface
 */
export interface ITaskManager {
  createTask(params: TaskParams): Promise<TaskId>;
  executeTask(taskId: TaskId): Promise<void>;
  cancelTask(taskId: TaskId): Promise<void>;
  getTask(taskId: TaskId): Promise<PendingTask | null>;
  getNextPendingTask(workflowId: WorkflowId): Promise<PendingTask | null>;
  completeTask(taskId: TaskId, result: TaskResult): Promise<void>;
  failTask(taskId: TaskId, error: Error): Promise<void>;
}

/**
 * Agent manager interface
 */
export interface IAgentManager extends EventEmitter {
  registerAgent(agentId: string, plugin?: PluginInstance): Promise<void>;
  unregisterAgent(agentId: string): Promise<void>;
  getAgent(agentId: string): PluginInstance | undefined;
  listAgents(): string[];
  executeAgent(agentId: string, params: TaskParams): Promise<AgentResult>;
  isAgentAvailable(agentId: string): boolean;
  getAgentCapabilities(agentId: string): string[];
}

/**
 * State manager interface
 */
export interface IStateManager {
  executeCommand(command: Command): Promise<void>;
  executeQuery<T = unknown>(query: Query): Promise<QueryResult<T>>;
  getState(): SystemState;
  subscribe(eventType: string, handler: (event: StateEvent) => void): void;
  unsubscribe(eventType: string, handler: (event: StateEvent) => void): void;
  snapshot(): Promise<SystemState>;
  restore(snapshot: SystemState): Promise<void>;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Orchestrator service interface
 */
export interface IOrchestratorService {
  initialize(config: OrchestratorConfig): Promise<void>;
  shutdown(): Promise<void>;
  parseCommand(input: string): ParsedCommand | null;
  analyzeComplexity(taskDescription: string): ComplexityAnalysis;
  executeWorkflow(command: ParsedCommand): Promise<WorkflowId>;
  getStatus(): SystemState;
}

/**
 * Notification service interface
 */
export interface INotificationService {
  notify(event: string, data: StateEvent): Promise<void>;
  subscribe(event: string, handler: (data: StateEvent) => void): void;
  unsubscribe(event: string, handler: (data: StateEvent) => void): void;
}

/**
 * Metrics service interface
 */
export interface IMetricsService {
  recordMetric(name: string, value: number, tags?: Record<string, string>): void;
  incrementCounter(name: string, tags?: Record<string, string>): void;
  recordDuration(name: string, duration: number, tags?: Record<string, string>): void;
  getMetric(name: string): number | undefined;
  getAllMetrics(): Record<string, number>;
  exportMetrics(): Promise<void>;
}

// ============================================================================
// Loader Interfaces
// ============================================================================

/**
 * Generic loader interface
 */
export interface ILoader<T> {
  load(identifier: string): Promise<T | null>;
  loadAll(): Promise<T[]>;
  reload(identifier: string): Promise<T | null>;
  unload(identifier: string): Promise<void>;
  isLoaded(identifier: string): boolean;
}

/**
 * Workflow loader interface
 */
export interface IWorkflowLoader extends ILoader<any> {
  loadWorkflow(workflowType: WorkflowType): Promise<any>;
  getWorkflowDefinition(workflowType: WorkflowType): WorkflowDefinition | null;
  validateWorkflow(workflow: WorkflowDefinition): boolean;
}

/**
 * Agent loader interface
 */
export interface IAgentLoader extends ILoader<any> {
  loadAgent(agentType: AgentType): Promise<any>;
  getAgentDefinition(agentType: AgentType): AgentDefinition | null;
  validateAgent(agent: AgentDefinition): boolean;
}

/**
 * Plugin loader interface
 */
export interface IPluginLoader extends ILoader<any> {
  discoverPlugins(directory: string): Promise<string[]>;
  loadPlugin(pluginId: string, pluginOrPath?: string | PluginInstance): Promise<PluginInstance | null>;
  getPlugin(pluginId: string): PluginInstance | undefined;
  getAllPlugins(): PluginInstance[];
}

// ============================================================================
// Strategy Interfaces
// ============================================================================

/**
 * Retry strategy interface
 */
export interface IRetryStrategy {
  shouldRetry(attempt: number, error: Error): boolean;
  getDelay(attempt: number): number;
  getMaxAttempts(): number;
}

/**
 * Load balancing strategy interface
 */
export interface ILoadBalancingStrategy {
  selectAgent(agents: string[], context?: HandlerContext): string | null;
  recordSuccess(agent: string): void;
  recordFailure(agent: string): void;
  getStats(): Record<string, any>;
}

/**
 * Caching strategy interface
 */
export interface ICachingStrategy {
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T, ttl?: number): void;
  delete(key: string): void;
  clear(): void;
  has(key: string): boolean;
}

// ============================================================================
// Observer/Listener Interfaces
// ============================================================================

/**
 * Event listener interface
 */
export interface IEventListener {
  onEvent(event: StateEvent): void;
}

/**
 * Workflow event listener
 */
export interface IWorkflowListener {
  onWorkflowCreated(workflow: WorkflowState): void;
  onWorkflowStarted(workflowId: WorkflowId): void;
  onWorkflowCompleted(workflowId: WorkflowId, result: WorkflowResult): void;
  onWorkflowFailed(workflowId: WorkflowId, error: Error): void;
  onWorkflowCancelled(workflowId: WorkflowId): void;
}

/**
 * Task event listener
 */
export interface ITaskListener {
  onTaskCreated(task: PendingTask): void;
  onTaskStarted(taskId: TaskId): void;
  onTaskCompleted(taskId: TaskId, result: TaskResult): void;
  onTaskFailed(taskId: TaskId, error: Error): void;
  onTaskRetrying(taskId: TaskId, attempt: number): void;
}

/**
 * Metrics listener
 */
export interface IMetricsListener {
  onMetricRecorded(name: string, value: number, tags?: Record<string, string>): void;
  onThresholdExceeded(metric: string, value: number, threshold: number): void;
}

// ============================================================================
// Factory Interfaces
// ============================================================================

/**
 * Generic factory interface
 */
export interface IFactory<T> {
  create(...args: unknown[]): T;
}

/**
 * Workflow factory interface
 */
export interface IWorkflowFactory extends IFactory<WorkflowState> {
  createWorkflow(type: WorkflowType, config: Partial<WorkflowState>): WorkflowState;
  createFromCommand(command: ParsedCommand): WorkflowState;
}

/**
 * Task factory interface
 */
export interface ITaskFactory extends IFactory<PendingTask> {
  createTask(params: TaskParams): PendingTask;
  createFromWorkflow(workflow: WorkflowState, agentType: AgentType): PendingTask;
}

/**
 * Error factory interface (already implemented but adding for completeness)
 */
export interface IErrorFactory {
  createError(code: string, message: string, context?: ErrorContext): Error;
  isCustomError(error: unknown): boolean;
}

// ============================================================================
// Builder Interfaces
// ============================================================================

/**
 * Generic builder interface
 */
export interface IBuilder<T> {
  build(): T;
  reset(): void;
}

/**
 * Workflow builder interface
 */
export interface IWorkflowBuilder extends IBuilder<any> {
  setType(type: WorkflowType): IWorkflowBuilder;
  setDescription(description: string): IWorkflowBuilder;
  addAgent(agent: AgentType): IWorkflowBuilder;
  setComplexity(complexity: ComplexityLevel): IWorkflowBuilder;
  setMetadata(metadata: Record<string, unknown>): IWorkflowBuilder;
  validate(): boolean;
}

/**
 * Query builder interface
 */
export interface IQueryBuilder extends IBuilder<any> {
  select(...fields: string[]): IQueryBuilder;
  from(source: string): IQueryBuilder;
  where(condition: Record<string, unknown>): IQueryBuilder;
  orderBy(field: string, direction?: 'asc' | 'desc'): IQueryBuilder;
  limit(count: number): IQueryBuilder;
  offset(count: number): IQueryBuilder;
}

// ============================================================================
// Handler Interfaces
// ============================================================================

/**
 * Generic message handler
 */
export interface IMessageHandler<T = any> {
  canHandle(message: T): boolean;
  handle(message: T): Promise<any>;
}

/**
 * Command handler interface
 */
export interface ICommandHandler {
  execute(command: Command): Promise<void>;
  canExecute(command: Command): boolean;
}

/**
 * Query handler interface
 */
export interface IQueryHandler {
  execute<T = unknown>(query: Query): Promise<QueryResult<T>>;
  canExecute(query: Query): boolean;
}

/**
 * Error handler interface
 */
export interface IErrorHandler {
  handle(error: Error): { statusCode: number; error: ErrorContext };
  canHandle(error: Error): boolean;
}

// ============================================================================
// Registry Interfaces
// ============================================================================

/**
 * Generic registry interface
 */
export interface IRegistry<T> {
  register(key: string, value: T): void;
  unregister(key: string): void;
  get(key: string): T | undefined;
  has(key: string): boolean;
  list(): string[];
  clear(): void;
}

/**
 * Capability registry interface
 */
export interface ICapabilityRegistry extends IRegistry<string[]> {
  registerCapability(agentId: string, capability: string): void;
  unregisterCapability(agentId: string, capability: string): void;
  getAgentsByCapability(capability: string): string[];
  hasCapability(agentId: string, capability: string): boolean;
}

// ============================================================================
// Client Interfaces
// ============================================================================

/**
 * HTTP client interface
 */
export interface IHttpClient {
  get<T>(url: string, config?: ApiConfig): Promise<T>;
  post<T>(url: string, data?: unknown, config?: ApiConfig): Promise<T>;
  put<T>(url: string, data?: unknown, config?: ApiConfig): Promise<T>;
  delete<T>(url: string, config?: ApiConfig): Promise<T>;
  patch<T>(url: string, data?: unknown, config?: ApiConfig): Promise<T>;
}

/**
 * Orchestrator client interface
 */
export interface IOrchestratorClient extends IHttpClient {
  initialize(config: any): Promise<void>;
  parseCommand(command: string): Promise<ParsedCommand>;
  executeWorkflow(request: ParsedCommand): Promise<WorkflowResult>;
  getTodos(): Promise<Todo[]>;
  getNextTodo(): Promise<Todo | null>;
  getNextTask(): Promise<TaskParams | null>;
  submitAgentResult(result: AgentResult): Promise<void>;
  getWorkflowStatus(workflowId: WorkflowId): Promise<any>;
}

// ============================================================================
// Adapter Interfaces
// ============================================================================

/**
 * Storage adapter interface
 */
export interface IStorageAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  read(key: string): Promise<StorageData | null>;
  write(key: string, value: StorageData): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
}

/**
 * Message queue adapter interface
 */
export interface IMessageQueueAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(topic: string, message: unknown): Promise<void>;
  subscribe(topic: string, handler: (message: unknown) => void): void;
  unsubscribe(topic: string): void;
}

// ============================================================================
// Validator Interfaces
// ============================================================================

/**
 * Generic validator interface
 */
export interface IValidator<T> {
  validate(input: unknown): T;
  isValid(input: unknown): boolean;
  getErrors(): string[];
}

/**
 * Schema validator interface
 */
export interface ISchemaValidator extends IValidator<any> {
  validateAgainstSchema(data: unknown, schema: object): boolean;
  getValidationErrors(): Array<{ field: string; message: string }>;
}

// ============================================================================
// Transformer Interfaces
// ============================================================================

/**
 * Generic transformer interface
 */
export interface ITransformer<TInput, TOutput> {
  transform(input: TInput): TOutput;
  canTransform(input: unknown): boolean;
}

/**
 * Workflow transformer interface
 */
export interface IWorkflowTransformer extends ITransformer<any, any> {
  transformToExecutable(workflow: WorkflowDefinition): unknown;
  transformToVisual(workflow: WorkflowDefinition): unknown;
  transformToStorage(workflow: WorkflowDefinition): StorageData;
}

// ============================================================================
// Monitor Interfaces
// ============================================================================

/**
 * Execution monitor interface
 */
export interface IExecutionMonitor {
  startMonitoring(executionId: string): void;
  stopMonitoring(executionId: string): void;
  recordEvent(executionId: string, event: StateEvent): void;
  getMetrics(executionId: string): Record<string, number>;
  getEvents(executionId: string): StateEvent[];
  isMonitoring(executionId: string): boolean;
}

/**
 * Performance monitor interface
 */
export interface IPerformanceMonitor {
  startTimer(name: string): void;
  endTimer(name: string): number;
  recordMemoryUsage(): void;
  recordCpuUsage(): void;
  getReport(): Record<string, unknown>;
}

// ============================================================================
// Stream Interfaces
// ============================================================================

/**
 * Event stream interface
 */
export interface IEventStream {
  emit(event: string, data: unknown): void;
  on(event: string, handler: (data: unknown) => void): void;
  off(event: string, handler: (data: unknown) => void): void;
  pipe(destination: IEventStream): void;
}

/**
 * Observable stream interface
 */
export interface IObservableStream<T> {
  subscribe(observer: (value: T) => void): void;
  unsubscribe(observer: (value: T) => void): void;
  asObservable(): Observable<T>;
}

// ============================================================================
// Export Type Guards
// ============================================================================

/**
 * Type guard functions for runtime type checking
 */
export const InterfaceTypeGuards = {
  isLogger: (obj: unknown): obj is ILogger => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'debug' in obj &&
      'info' in obj &&
      'warn' in obj &&
      'error' in obj &&
      typeof (obj as any).debug === 'function' &&
      typeof (obj as any).info === 'function' &&
      typeof (obj as any).warn === 'function' &&
      typeof (obj as any).error === 'function'
    );
  },

  isWorkflowManager: (obj: unknown): obj is IWorkflowManager => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'createWorkflow' in obj &&
      'executeWorkflow' in obj &&
      'getWorkflow' in obj &&
      typeof (obj as any).createWorkflow === 'function' &&
      typeof (obj as any).executeWorkflow === 'function' &&
      typeof (obj as any).getWorkflow === 'function'
    );
  },

  isTaskManager: (obj: unknown): obj is ITaskManager => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'createTask' in obj &&
      'executeTask' in obj &&
      'getTask' in obj &&
      typeof (obj as any).createTask === 'function' &&
      typeof (obj as any).executeTask === 'function' &&
      typeof (obj as any).getTask === 'function'
    );
  },

  isEventListener: (obj: unknown): obj is IEventListener => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'onEvent' in obj &&
      typeof (obj as any).onEvent === 'function'
    );
  },

  isFactory: (obj: unknown): obj is IFactory<unknown> => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'create' in obj &&
      typeof (obj as any).create === 'function'
    );
  },

  isBuilder: (obj: unknown): obj is IBuilder<unknown> => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'build' in obj &&
      'reset' in obj &&
      typeof (obj as any).build === 'function' &&
      typeof (obj as any).reset === 'function'
    );
  },

  isValidator: (obj: unknown): obj is IValidator<unknown> => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'validate' in obj &&
      'isValid' in obj &&
      typeof (obj as any).validate === 'function' &&
      typeof (obj as any).isValid === 'function'
    );
  }
};