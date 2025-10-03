import { Observable } from 'rxjs';
import {
  WorkflowId,
  TaskId,
  AgentName,
  Command,
  Query,
  EventId
} from '../state/types';
import {
  ComplexityLevel,
  WorkflowStatus,
  TaskStatus,
  ExecutionStatus,
  TraceType
} from '../enums';
import {
  CompiledWorkflow,
  WorkflowContext,
  StageResult,
  StageId,
  ErrorStrategy,
  RetryConfig,
  WorkflowError,
} from '../workflow/types';

// Re-export commonly used types
export type { WorkflowId, TaskId, StageId, AgentName, ComplexityLevel, WorkflowContext, CompiledWorkflow };

// =====================
// Priority Types
// =====================

export enum TaskPriority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
  BACKGROUND = 4,
}

export interface PrioritizedTask {
  id: TaskId;
  priority: TaskPriority;
  task: ExecutableTask;
  enqueuedAt: Date;
  deadline?: Date;
  affinity?: string;
  resourceRequirements?: ResourceRequirements;
}

export interface ResourceRequirements {
  cpu?: number;
  memory?: number;
  io?: number;
  network?: number;
  customResources?: Record<string, number>;
}

// =====================
// Execution Types
// =====================

export interface ExecutionContext {
  executionId: string;
  workflowId: WorkflowId;
  parentExecutionId?: string;
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  status: ExecutionStatus;
  context: WorkflowContext;
  checkpointId?: string;
  metrics?: ExecutionMetrics;
  traceId?: string;
  spanId?: string;
  correlationId?: string;
}

// Re-export ExecutionStatus from enums
export { ExecutionStatus };

export interface ExecutableTask {
  id: TaskId;
  stageId: StageId;
  type: 'agent' | 'transform' | 'wait' | 'subworkflow';
  agentName?: AgentName;
  complexity?: ComplexityLevel;
  params?: any;
  timeout?: number;
  retryConfig?: RetryConfig;
  errorStrategy?: ErrorStrategy;
  dependencies?: TaskId[];
  metadata?: Record<string, any>;
}

export interface TaskExecution {
  taskId: TaskId;
  executionId: string;
  status: TaskExecutionStatus;
  attempts: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  result?: any;
  error?: TaskError;
  metrics?: TaskMetrics;
}

export enum TaskExecutionStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  RETRYING = 'retrying',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  SKIPPED = 'skipped',
}

export interface TaskError {
  code: string;
  message: string;
  stack?: string;
  retryable: boolean;
  details?: any;
}

// =====================
// Circuit Breaker Types
// =====================

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  halfOpenMaxAttempts: number;
  monitoringWindow: number;
  minimumRequestCount?: number;
  fallbackFunction?: (context: any) => Promise<any>;
}

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  lastStateChangeTime: Date;
  halfOpenAttempts: number;
  totalRequests: number;
  errorRate: number;
}

export interface CircuitBreakerEvent {
  type: 'state_change' | 'failure' | 'success' | 'timeout' | 'fallback';
  previousState?: CircuitState;
  newState?: CircuitState;
  error?: Error;
  timestamp: Date;
  metadata?: any;
}

// =====================
// Retry Types
// =====================

export enum RetryStrategy {
  EXPONENTIAL = 'exponential',
  LINEAR = 'linear',
  FIXED = 'fixed',
  FIBONACCI = 'fibonacci',
  CUSTOM = 'custom',
}

export interface RetryPolicy {
  strategy: RetryStrategy;
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  multiplier?: number;
  jitter?: boolean;
  jitterFactor?: number;
  retryableErrors?: string[];
  nonRetryableErrors?: string[];
  customStrategy?: (attempt: number) => number;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface RetryAttempt {
  attemptNumber: number;
  attemptedAt: Date;
  error: Error;
  delay: number;
  willRetry: boolean;
}

export interface RetryState {
  attempts: RetryAttempt[];
  nextRetryAt?: Date;
  exhausted: boolean;
  lastError?: Error;
}

// =====================
// Checkpoint Types
// =====================

export interface Checkpoint {
  id: string;
  executionId: string;
  workflowId: WorkflowId;
  createdAt: Date;
  type: CheckpointType;
  state: CheckpointState;
  metadata?: CheckpointMetadata;
  size: number;
  compressed: boolean;
  encrypted: boolean;
}

export enum CheckpointType {
  FULL = 'full',
  INCREMENTAL = 'incremental',
  DIFFERENTIAL = 'differential',
  SNAPSHOT = 'snapshot',
}

export interface CheckpointState {
  executionContext: ExecutionContext;
  completedTasks: Set<TaskId>;
  taskStates: Map<TaskId, TaskExecution>;
  workflowContext: WorkflowContext;
  variables: Record<string, any>;
  customState?: any;
}

export interface CheckpointMetadata {
  triggerReason: 'scheduled' | 'manual' | 'pre_failure' | 'milestone';
  previousCheckpointId?: string;
  isRecoveryPoint: boolean;
  retentionPolicy?: RetentionPolicy;
  tags?: string[];
}

export interface RetentionPolicy {
  maxAge?: number;
  maxCount?: number;
  keepMilestones: boolean;
  keepFailures: boolean;
}

// =====================
// Recovery Types
// =====================

export interface RecoveryStrategy {
  type: RecoveryType;
  checkpointId?: string;
  compensationActions?: CompensationAction[];
  fallbackWorkflowId?: WorkflowId;
  maxRecoveryAttempts: number;
  recoveryTimeout: number;
}

export enum RecoveryType {
  FROM_CHECKPOINT = 'from_checkpoint',
  FROM_BEGINNING = 'from_beginning',
  PARTIAL = 'partial',
  COMPENSATE = 'compensate',
  FALLBACK = 'fallback',
  MANUAL = 'manual',
}

export interface CompensationAction {
  taskId: TaskId;
  action: 'undo' | 'retry' | 'skip' | 'replace';
  compensationTask?: ExecutableTask;
  condition?: string;
}

export interface RecoveryState {
  recoveryId: string;
  originalExecutionId: string;
  recoveryType: RecoveryType;
  startedAt: Date;
  completedAt?: Date;
  status: RecoveryStatus;
  recoveredTasks: Set<TaskId>;
  failedRecoveries: RecoveryAttempt[];
  metrics?: RecoveryMetrics;
}

export enum RecoveryStatus {
  INITIATED = 'initiated',
  ANALYZING = 'analyzing',
  RECOVERING = 'recovering',
  COMPENSATING = 'compensating',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ABORTED = 'aborted',
}

export interface RecoveryAttempt {
  attemptNumber: number;
  attemptedAt: Date;
  strategy: RecoveryType;
  error?: Error;
  recoveredTasks: TaskId[];
}

// =====================
// Debug Types
// =====================

export interface DebugSession {
  sessionId: string;
  executionId: string;
  startedAt: Date;
  endedAt?: Date;
  breakpoints: Breakpoint[];
  traces: ExecutionTrace[];
  snapshots: DebugSnapshot[];
  watchedVariables: Set<string>;
  stepMode: StepMode;
  currentPosition?: DebugPosition;
}

export interface Breakpoint {
  id: string;
  location: BreakpointLocation;
  condition?: string;
  hitCount: number;
  enabled: boolean;
  actions?: BreakpointAction[];
}

export type BreakpointLocation =
  | { type: 'task'; taskId: TaskId }
  | { type: 'stage'; stageId: StageId }
  | { type: 'line'; file: string; line: number }
  | { type: 'error'; errorType?: string }
  | { type: 'condition'; expression: string };

export interface BreakpointAction {
  type: 'log' | 'snapshot' | 'evaluate' | 'modify';
  payload: any;
}

export enum StepMode {
  NONE = 'none',
  INTO = 'into',
  OVER = 'over',
  OUT = 'out',
  CONTINUE = 'continue',
}

export interface ExecutionTrace {
  timestamp: Date;
  type: TraceType;
  location: string;
  data: any;
  stackDepth: number;
  variables?: Record<string, any>;
}

// Re-export TraceType from enums
export { TraceType };

export interface DebugSnapshot {
  id: string;
  timestamp: Date;
  executionState: ExecutionContext;
  taskStates: Map<TaskId, TaskExecution>;
  variables: Record<string, any>;
  callStack: CallFrame[];
  breakpointId?: string;
}

export interface CallFrame {
  id: string;
  name: string;
  location: string;
  variables: Record<string, any>;
  parent?: string;
}

export interface DebugPosition {
  taskId?: TaskId;
  stageId?: StageId;
  line?: number;
  column?: number;
}

// =====================
// Monitoring Types
// =====================

export interface ExecutionMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  tasksTotal: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksSkipped: number;
  avgTaskDuration: number;
  p50TaskDuration: number;
  p95TaskDuration: number;
  p99TaskDuration: number;
  cpuUsage: number;
  memoryUsage: number;
  throughput: number;
  errorRate: number;
  retryRate: number;
  checkpointCount: number;
  recoveryCount: number;
}

export interface TaskMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  attempts: number;
  retries: number;
  queueTime: number;
  executionTime: number;
  cpuTime?: number;
  memoryPeak?: number;
  ioOperations?: number;
  networkCalls?: number;
}

export interface RecoveryMetrics {
  recoveryTime: number;
  tasksRecovered: number;
  dataLoss: boolean;
  checkpointAge?: number;
  attemptCount: number;
}

export interface MonitoringConfig {
  metricsInterval: number;
  metricsRetention: number;
  alertThresholds: AlertThresholds;
  customMetrics?: CustomMetric[];
  exporters?: MetricExporter[];
}

export interface AlertThresholds {
  errorRate: number;
  taskDuration: number;
  memoryUsage: number;
  cpuUsage: number;
  queueLength: number;
  circuitBreakerOpen: boolean;
}

export interface CustomMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  labels?: string[];
  help?: string;
  buckets?: number[];
}

export interface MetricExporter {
  type: 'prometheus' | 'datadog' | 'newrelic' | 'custom';
  config: any;
  interval: number;
}

// =====================
// Event Types
// =====================

export interface ExecutionEvent {
  type: ExecutionEventType;
  executionId: string;
  timestamp: Date;
  data: any;
  source: string;
  correlationId?: string;
  taskId?: string;
  workflowId?: string;
  message?: string;
  metadata?: {
    agentName?: string;
    progress?: number;
    stage?: string;
    estimatedCompletion?: Date;
    startTime?: Date;
    elapsedTime?: number;
    estimatedRemainingTime?: number;
    [key: string]: any;
  };
}

export enum ExecutionEventType {
  // Lifecycle events
  EXECUTION_STARTED = 'execution_started',
  EXECUTION_COMPLETED = 'execution_completed',
  EXECUTION_FAILED = 'execution_failed',
  EXECUTION_CANCELLED = 'execution_cancelled',
  EXECUTION_PAUSED = 'execution_paused',
  EXECUTION_RESUMED = 'execution_resumed',

  // Task events
  TASK_QUEUED = 'task_queued',
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_RETRYING = 'task_retrying',
  TASK_SKIPPED = 'task_skipped',
  TASK_PROGRESS = 'task_progress',
  TASK_UPDATED = 'task_updated',

  // Circuit breaker events
  CIRCUIT_OPENED = 'circuit_opened',
  CIRCUIT_CLOSED = 'circuit_closed',
  CIRCUIT_HALF_OPEN = 'circuit_half_open',

  // Checkpoint events
  CHECKPOINT_CREATED = 'checkpoint_created',
  CHECKPOINT_RESTORED = 'checkpoint_restored',
  CHECKPOINT_DELETED = 'checkpoint_deleted',

  // Recovery events
  RECOVERY_STARTED = 'recovery_started',
  RECOVERY_COMPLETED = 'recovery_completed',
  RECOVERY_FAILED = 'recovery_failed',

  // Debug events
  BREAKPOINT_HIT = 'breakpoint_hit',
  STEP_COMPLETED = 'step_completed',
  WATCH_TRIGGERED = 'watch_triggered',

  // Monitoring events
  METRIC_THRESHOLD_EXCEEDED = 'metric_threshold_exceeded',
  HEALTH_CHECK_FAILED = 'health_check_failed',
  RESOURCE_EXHAUSTED = 'resource_exhausted',
}

// =====================
// Observable Types
// =====================

export interface ExecutionObservables {
  events$: Observable<ExecutionEvent>;
  metrics$: Observable<ExecutionMetrics>;
  tasks$: Observable<TaskExecution>;
  errors$: Observable<Error>;
  state$: Observable<ExecutionContext>;
  debug$: Observable<ExecutionTrace>;
  alerts$: Observable<Alert>;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  type: string;
  message: string;
  source: string;
  timestamp: Date;
  metadata?: any;
  acknowledged?: boolean;
}

// =====================
// Configuration Types
// =====================

export interface ExecutionEngineConfig {
  maxConcurrentExecutions: number;
  maxConcurrentTasks: number;
  defaultTimeout: number;
  checkpointInterval: number;
  enableCheckpointing: boolean;
  enableMetrics: boolean;
  enableTracing: boolean;
  enableDebug: boolean;
  circuitBreakerConfig?: CircuitBreakerConfig;
  retryPolicy?: RetryPolicy;
  monitoringConfig?: MonitoringConfig;
  schedulerConfig?: SchedulerConfig;
  recoveryConfig?: RecoveryConfig;
}

export interface SchedulerConfig {
  workerPoolSize: number;
  queueCapacity: number;
  schedulingInterval: number;
  priorityLevels: number;
  enableAffinity: boolean;
  enablePreemption: boolean;
  resourceTracking: boolean;
  loadBalancing: 'round_robin' | 'least_loaded' | 'random' | 'affinity';
}

export interface RecoveryConfig {
  enableAutoRecovery: boolean;
  checkpointRetention: RetentionPolicy;
  maxRecoveryAttempts: number;
  recoveryTimeout: number;
  recoveryStrategies: RecoveryType[];
}

// =====================
// Worker Types
// =====================

export interface Worker {
  id: string;
  status: WorkerStatus;
  currentTask?: TaskId;
  capacity: ResourceRequirements;
  utilization: ResourceRequirements;
  startedAt: Date;
  lastHeartbeat: Date;
  tasksCompleted: number;
  tasksFailed: number;
  averageTaskDuration: number;
}

export enum WorkerStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  DRAINING = 'draining',
  TERMINATED = 'terminated',
  FAILED = 'failed',
}

export interface WorkerPool {
  workers: Map<string, Worker>;
  activeWorkers: number;
  totalCapacity: ResourceRequirements;
  currentUtilization: ResourceRequirements;
  queueLength: number;
  metrics: WorkerPoolMetrics;
}

export interface WorkerPoolMetrics {
  tasksProcessed: number;
  averageQueueTime: number;
  averageProcessingTime: number;
  workerUtilization: number;
  throughput: number;
}

// =====================
// Queue Types
// =====================

export interface QueueStats {
  length: number;
  oldestTaskAge: number;
  averageWaitTime: number;
  throughput: number;
  priorityDistribution: Record<TaskPriority, number>;
}

export interface DLQEntry {
  task: ExecutableTask;
  failures: TaskError[];
  enqueuedAt: Date;
  lastAttemptAt: Date;
  attempts: number;
  metadata?: any;
}