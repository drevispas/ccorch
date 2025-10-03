import { z } from 'zod';
import { WorkflowId, TaskId, AgentName, ComplexityLevel } from '../state/types';
import {
  OptimizationType,
  EdgeType,
  NotificationType,
  IteratorType,
  VariableType,
  MigrationType,
  LayoutDirection,
  LayoutAlgorithm,
  PortType,
  PortPosition,
  NodeShape,
  ValidationSeverity,
  SortOrder,
  ResultStatus,
  ContextStatus,
  ImpactLevel
} from '../enums';

// Re-export types for use by other modules
export { ComplexityLevel };

// =====================
// Core DSL Types
// =====================

export type StageId = string;
export type WorkflowVersion = string;
export type VariableName = string;

// =====================
// Stage Types
// =====================

export enum StageType {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  CONDITIONAL = 'conditional',
  LOOP = 'loop',
  TASK = 'task',
  SUBWORKFLOW = 'subworkflow',
  WAIT = 'wait',
  TRANSFORM = 'transform',
}

export enum ErrorStrategy {
  FAIL_FAST = 'fail_fast',
  CONTINUE = 'continue',
  RETRY = 'retry',
  FALLBACK = 'fallback',
  COMPENSATE = 'compensate',
  IGNORE = 'ignore',
}

export enum RetryStrategy {
  EXPONENTIAL = 'exponential',
  LINEAR = 'linear',
  FIXED = 'fixed',
  CUSTOM = 'custom',
}

export enum TriggerType {
  MANUAL = 'manual',
  SCHEDULED = 'scheduled',
  EVENT = 'event',
  WEBHOOK = 'webhook',
  FILE_WATCH = 'file_watch',
  CONDITION = 'condition',
}

// =====================
// Workflow Definitions
// =====================

export interface WorkflowMetadata {
  id: WorkflowId;
  name: string;
  description: string;
  version: WorkflowVersion;
  author: string;
  tags: string[];
  created: Date;
  updated: Date;
  deprecated?: boolean;
  expiresAt?: Date;
}

export interface WorkflowTrigger {
  type: TriggerType;
  config: {
    schedule?: string; // cron expression
    event?: string;
    webhook?: {
      url: string;
      method: string;
      headers?: Record<string, string>;
    };
    filePath?: string;
    condition?: string; // expression to evaluate
  };
  enabled: boolean;
}

export interface TimeoutConfig {
  global?: number;
  perStage?: Record<StageId, number>;
  perTask?: Record<TaskId, number>;
  gracefulShutdown?: number;
}

export interface RetryConfig {
  strategy: RetryStrategy;
  maxAttempts: number;
  delay: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  retryableErrors?: string[];
}

export interface ErrorHandler {
  strategy: ErrorStrategy;
  retryConfig?: RetryConfig;
  fallbackStage?: StageId;
  compensationStage?: StageId;
  onError?: string; // JavaScript expression
  notifications?: NotificationConfig[];
}

export interface NotificationConfig {
  type: NotificationType;
  target: string;
  template?: string;
  condition?: string; // when to notify
}

// =====================
// Stage Definitions
// =====================

export interface BaseStage {
  id: StageId;
  name: string;
  description?: string;
  type: StageType;
  condition?: string; // JavaScript expression for conditional execution
  timeout?: number;
  retryConfig?: RetryConfig;
  errorHandler?: ErrorHandler;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface TaskStage extends BaseStage {
  type: StageType.TASK;
  agent: AgentName;
  complexity: ComplexityLevel;
  input: Record<string, any> | string; // Direct value or expression
  output?: {
    variable: VariableName;
    transform?: string; // JavaScript expression to transform output
  };
  dependencies?: StageId[];
}

export interface SequentialStage extends BaseStage {
  type: StageType.SEQUENTIAL;
  stages: PipelineStage[];
}

export interface ParallelStage extends BaseStage {
  type: StageType.PARALLEL;
  stages: PipelineStage[];
  maxConcurrency?: number;
  waitAll?: boolean; // Wait for all or just one
  aggregateOutput?: string; // JavaScript expression to combine outputs
}

export interface ConditionalStage extends BaseStage {
  type: StageType.CONDITIONAL;
  expression: string; // JavaScript expression
  thenStage: PipelineStage;
  elseStage?: PipelineStage;
}

export interface LoopStage extends BaseStage {
  type: StageType.LOOP;
  iterator: {
    type: IteratorType;
    variable?: VariableName;
    collection?: string; // Expression returning array
    condition?: string; // For while loops
    start?: number; // For for loops
    end?: number;
    step?: number;
  };
  body: PipelineStage;
  maxIterations?: number;
}

export interface SubWorkflowStage extends BaseStage {
  type: StageType.SUBWORKFLOW;
  workflowId: WorkflowId;
  version?: WorkflowVersion;
  input: Record<string, any>;
  output?: {
    variable: VariableName;
    mapping?: Record<string, string>; // Map subworkflow outputs to parent variables
  };
  async?: boolean;
}

export interface WaitStage extends BaseStage {
  type: StageType.WAIT;
  duration?: number; // milliseconds
  until?: string; // JavaScript expression or ISO date string
  event?: string; // Wait for event
}

export interface TransformStage extends BaseStage {
  type: StageType.TRANSFORM;
  input: Record<string, any> | string;
  transform: string; // JavaScript expression
  output: {
    variable: VariableName;
  };
}

export type PipelineStage =
  | TaskStage
  | SequentialStage
  | ParallelStage
  | ConditionalStage
  | LoopStage
  | SubWorkflowStage
  | WaitStage
  | TransformStage;

// =====================
// Variable Definitions
// =====================

export interface VariableDefinition {
  name: VariableName;
  type: VariableType;
  defaultValue?: any;
  required?: boolean;
  description?: string;
  validation?: string; // JavaScript expression for validation
  enum?: any[]; // Allowed values
  sensitive?: boolean; // For secrets
}

// =====================
// Workflow DSL
// =====================

export interface WorkflowDSL {
  metadata: WorkflowMetadata;
  triggers?: WorkflowTrigger[];
  variables: VariableDefinition[];
  context?: Record<string, any>; // Initial context
  pipeline: PipelineStage[];
  errorHandling: ErrorHandler;
  timeouts: TimeoutConfig;
  notifications?: NotificationConfig[];
  hooks?: WorkflowHooks;
  features?: WorkflowFeatures;
}

export interface WorkflowHooks {
  beforeStart?: string; // JavaScript expression
  afterComplete?: string;
  onError?: string;
  onCancel?: string;
  onTimeout?: string;
  beforeStage?: string;
  afterStage?: string;
}

export interface WorkflowFeatures {
  checkpointing?: boolean;
  debugging?: boolean;
  tracing?: boolean;
  metrics?: boolean;
  parallelism?: {
    enabled: boolean;
    maxWorkers?: number;
  };
  caching?: {
    enabled: boolean;
    ttl?: number;
  };
}

// =====================
// Compiled Workflow
// =====================

export interface CompiledWorkflow {
  id: WorkflowId;
  version: WorkflowVersion;
  source: WorkflowDSL;
  ast: WorkflowAST;
  executable: ExecutableWorkflow;
  optimizations: OptimizationReport[];
  validationResult: ValidationResult;
  compiledAt: Date;
  compiler: {
    version: string;
    features: string[];
  };
}

export interface WorkflowAST {
  root: ASTNode;
  nodes: Map<string, ASTNode>;
  edges: Map<string, ASTEdge[]>;
  variables: Map<VariableName, VariableDefinition>;
  dependencies: Map<StageId, StageId[]>;
}

export interface ASTNode {
  id: string;
  type: StageType;
  stage: PipelineStage;
  children: string[];
  parents: string[];
  depth: number;
  metadata: {
    estimatedDuration?: number;
    complexity?: number;
    parallelizable?: boolean;
  };
}

export interface ASTEdge {
  from: string;
  to: string;
  type: EdgeType;
  condition?: string;
  metadata?: Record<string, any>;
}

export interface ExecutableWorkflow {
  id: WorkflowId;
  version: WorkflowVersion;
  stages: Map<StageId, ExecutableStage>;
  executionPlan: ExecutionPlan;
  context: WorkflowContext;
  runtime: RuntimeConfig;
}

export interface ExecutableStage {
  id: StageId;
  execute: (context: WorkflowContext) => Promise<StageResult>;
  validate: (context: WorkflowContext) => ValidationResult;
  estimateDuration: () => number;
  getDependencies: () => StageId[];
  canParallelize: () => boolean;
}

export interface ExecutionPlan {
  phases: ExecutionPhase[];
  totalEstimatedDuration: number;
  criticalPath: StageId[];
  parallelizableStages: StageId[][];
}

export interface ExecutionPhase {
  id: string;
  stages: StageId[];
  parallel: boolean;
  estimatedDuration: number;
  dependencies: string[]; // Phase IDs
}

export interface WorkflowContext {
  workflowId: WorkflowId;
  executionId: string;
  variables: Map<VariableName, any>;
  results: Map<StageId, StageResult>;
  metadata: Record<string, any>;
  startedAt?: Date;
  checkpoints: Checkpoint[];
  currentStage?: StageId;
  status: ContextStatus;
  errors: WorkflowError[];
}

export interface StageResult {
  stageId: StageId;
  status: ResultStatus;
  output?: any;
  error?: WorkflowError;
  startedAt: Date;
  completedAt: Date;
  duration: number;
  retries?: number;
  metadata?: Record<string, any>;
}

export interface WorkflowError {
  code: string;
  message: string;
  stage?: StageId;
  timestamp: Date;
  stack?: string;
  recoverable?: boolean;
  retryable?: boolean;
  context?: Record<string, any>;
}

export interface Checkpoint {
  id: string;
  stageId: StageId;
  timestamp: Date;
  state: Partial<WorkflowContext>;
  resumable: boolean;
}

export interface RuntimeConfig {
  maxConcurrency: number;
  checkpointInterval?: number;
  debugMode: boolean;
  tracingEnabled: boolean;
  metricsEnabled: boolean;
  cachingEnabled: boolean;
  environment: Record<string, string>;
}

// =====================
// Optimization Types
// =====================

export interface OptimizationReport {
  type: OptimizationType;
  description: string;
  impact: ImpactLevel;
  before: any;
  after: any;
  savings?: {
    time?: number;
    resources?: number;
  };
  // Additional fields for specific optimizations
  stages?: StageId[];
  estimatedImprovement?: number;
  suggestions?: any[];
}

// =====================
// Validation Types
// =====================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  info: ValidationInfo[];
}

export interface ValidationError {
  code: string;
  message: string;
  path: string; // JSON path to the error
  severity: ValidationSeverity;
  suggestion?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  path: string;
  severity: ValidationSeverity;
  suggestion?: string;
}

export interface ValidationInfo {
  code: string;
  message: string;
  path: string;
  severity: ValidationSeverity;
}

// =====================
// Migration Types
// =====================

export interface WorkflowMigration {
  fromVersion: WorkflowVersion;
  toVersion: WorkflowVersion;
  changes: MigrationChange[];
  migrate: (workflow: WorkflowDSL) => WorkflowDSL;
  validate: (workflow: WorkflowDSL) => boolean;
  rollback?: (workflow: WorkflowDSL) => WorkflowDSL;
}

export interface MigrationChange {
  type: MigrationType;
  path: string;
  description: string;
  breaking: boolean;
  automated: boolean;
  migration?: (value: any) => any;
}

// =====================
// Visual Editor Types
// =====================

export interface WorkflowVisualization {
  nodes: VisualNode[];
  edges: VisualEdge[];
  layout: LayoutConfig;
  theme: VisualTheme;
}

export interface VisualNode {
  id: string;
  stageId: StageId;
  type: StageType;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  style: NodeStyle;
  ports: Port[];
  data: PipelineStage;
}

export interface VisualEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  label?: string;
  style: EdgeStyle;
  type: EdgeType;
}

export interface Port {
  id: string;
  type: 'input' | 'output';
  position: 'top' | 'right' | 'bottom' | 'left';
  label?: string;
  multiple?: boolean;
}

export interface NodeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  icon?: string;
  shape?: 'rectangle' | 'circle' | 'diamond' | 'hexagon';
}

export interface EdgeStyle {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  animated?: boolean;
  arrow?: boolean;
}

export interface LayoutConfig {
  direction: 'TB' | 'BT' | 'LR' | 'RL';
  spacing: { x: number; y: number };
  padding: number;
  algorithm: 'dagre' | 'force' | 'grid' | 'manual';
}

export interface VisualTheme {
  name: string;
  colors: {
    background: string;
    node: Record<StageType, string>;
    edge: string;
    text: string;
    error: string;
    success: string;
    warning: string;
  };
  fonts: {
    family: string;
    size: number;
  };
}