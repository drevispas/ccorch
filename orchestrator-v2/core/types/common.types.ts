/**
 * Common Type Definitions for Orchestrator V2
 *
 * This module contains all shared type definitions used throughout
 * the application to replace generic 'any' types with proper typing.
 */

import { WorkflowId, TaskId, AgentType, Todo, ComplexityLevel, WorkflowStatus, WorkflowType } from '../../server/schemas/common';

// ============================================================================
// Configuration Types
// ============================================================================

export interface OrchestratorConfig {
  logLevel?: string;
  enableMetrics?: boolean;
  enableDebug?: boolean;
  maxConcurrentWorkflows?: number;
  maxConcurrentTasks?: number;
  defaultTimeout?: number;
  pluginsDirectory?: string;
  workflowsDirectory?: string;
  todoWriteCallback?: (todos: any) => void;
  taskCallback?: (params: any) => void;
}

export interface LoggerConfig {
  logLevel: string;
  enableMetrics: boolean;
  logDirectory?: string;
  enableConsole?: boolean;
  enableFile?: boolean;
}

export interface PluginConfig {
  pluginsDir?: string;
  enableAutoDiscovery?: boolean;
  requireManifest?: boolean;
  maxConcurrentLoads?: number;
  enableCaching?: boolean;
  autoReload?: boolean;
  pluginDirectory?: string;
}

// ============================================================================
// Metadata Types
// ============================================================================

export interface LogMetadata {
  correlationId?: string;
  workflowId?: string;
  taskId?: string;
  agentName?: string;
  duration?: number;
  timestamp?: string;
  source?: string;
  level?: string;
  context?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface WorkflowMetadata {
  createdAt: string;
  updatedAt?: string;
  version?: string;
  author?: string;
  tags?: string[];
  description?: string;
  complexity?: ComplexityLevel;
  estimatedDuration?: number;
  [key: string]: string | number | boolean | string[] | undefined;
}

export interface TaskMetadata {
  category?: string;
  complexity?: ComplexityLevel;
  timestamp?: string;
  retryCount?: number;
  timeout?: number;
  priority?: number;
  dependencies?: string[];
}

// ============================================================================
// Result Types
// ============================================================================

export interface AgentResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: {
    duration?: number;
    timestamp?: string;
    agentType?: AgentType;
    [key: string]: unknown;
  };
}

export interface TaskResult {
  taskId: TaskId;
  success: boolean;
  result?: unknown;
  error?: string;
  completedAt: string;
  duration?: number;
}

export interface WorkflowResult {
  workflowId: WorkflowId;
  status: WorkflowStatus;
  results?: TaskResult[];
  error?: string;
  completedAt?: string;
  totalDuration?: number;
}

// ============================================================================
// Command & Query Types
// ============================================================================

export interface Command {
  type: string;
  payload: unknown;
  metadata?: {
    correlationId?: string;
    timestamp?: string;
    source?: string;
  };
}

export interface Query {
  type: string;
  filters?: Record<string, unknown>;
  pagination?: {
    page?: number;
    limit?: number;
    offset?: number;
  };
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
}

export interface QueryResult<T = unknown> {
  data: T;
  metadata?: {
    total?: number;
    page?: number;
    pageSize?: number;
    hasMore?: boolean;
  };
}

// ============================================================================
// State Types
// ============================================================================

export interface SystemState {
  workflows: Map<WorkflowId, WorkflowStateData>;
  tasks: Map<TaskId, TaskStateData>;
  agents: Map<string, AgentStateData>;
  metrics?: SystemMetrics;
}

export interface WorkflowStateData {
  id: WorkflowId;
  type: WorkflowType;
  status: WorkflowStatus;
  tasks: TaskId[];
  currentTask?: TaskId;
  metadata?: WorkflowMetadata;
  result?: unknown;
  error?: string;
}

export interface TaskStateData {
  id: TaskId;
  workflowId: WorkflowId;
  agentType: AgentType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: unknown;
  output?: unknown;
  error?: string;
  metadata?: TaskMetadata;
}

export interface AgentStateData {
  id: string;
  type: AgentType;
  status: 'idle' | 'busy' | 'error';
  currentTask?: TaskId;
  capabilities: string[];
  metrics?: {
    tasksCompleted: number;
    tasksFailed: number;
    averageDuration: number;
  };
}

export interface SystemMetrics {
  totalWorkflows: number;
  activeWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageWorkflowDuration: number;
  averageTaskDuration: number;
  systemUptime: number;
}

// ============================================================================
// Event Types
// ============================================================================

export interface SystemEvent {
  type: string;
  timestamp: string;
  data: unknown;
  metadata?: {
    correlationId?: string;
    source?: string;
    [key: string]: unknown;
  };
}

export interface WorkflowEvent extends SystemEvent {
  workflowId: WorkflowId;
  data: {
    status?: WorkflowStatus;
    progress?: number;
    message?: string;
    [key: string]: unknown;
  };
}

export interface TaskEvent extends SystemEvent {
  taskId: TaskId;
  workflowId: WorkflowId;
  data: {
    status?: string;
    progress?: number;
    message?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// Plugin Types
// ============================================================================

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies?: Record<string, string>;
  capabilities?: string[];
  config?: Record<string, unknown>;
}

export interface PluginInstance {
  id: string;
  manifest: PluginManifest;
  instance: unknown;
  status: 'loaded' | 'unloaded' | 'error';
  error?: string;
}

// ============================================================================
// Workflow Definition Types
// ============================================================================

export interface WorkflowDefinition {
  type: WorkflowType;
  name: string;
  description?: string;
  agents: {
    sequence: Array<{
      name: string;
      type: AgentType;
      config?: Record<string, unknown>;
    }>;
    parallel?: Array<{
      name: string;
      type: AgentType;
      config?: Record<string, unknown>;
    }>;
  };
  config?: {
    timeout?: number;
    retryPolicy?: {
      maxRetries: number;
      backoffMs: number;
    };
    [key: string]: unknown;
  };
}

export interface AgentDefinition {
  type: AgentType;
  name: string;
  description?: string;
  capabilities: string[];
  config?: Record<string, unknown>;
  supportedComplexities?: ComplexityLevel[];
}

// ============================================================================
// API Types
// ============================================================================

export interface ApiConfig {
  baseURL?: string;
  apiKey?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export interface ApiRequestConfig extends ApiConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  params?: Record<string, unknown>;
  data?: unknown;
}

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    field: string;
    message: string;
    value?: unknown;
  }>;
  warnings?: string[];
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'type' | 'pattern' | 'range' | 'custom';
  value?: unknown;
  message?: string;
  validator?: (value: unknown) => boolean;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface StorageData {
  key: string;
  value: unknown;
  metadata?: {
    createdAt: string;
    updatedAt?: string;
    expiresAt?: string;
    [key: string]: unknown;
  };
}

export interface StorageQuery {
  prefix?: string;
  pattern?: string;
  limit?: number;
  offset?: number;
  includeMetadata?: boolean;
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  ttl?: number;
  createdAt: number;
  accessCount?: number;
  lastAccessedAt?: number;
}

export interface CacheOptions {
  ttl?: number;
  maxSize?: number;
  evictionPolicy?: 'lru' | 'lfu' | 'fifo';
}

// ============================================================================
// Error Context Types
// ============================================================================

export interface ErrorContext {
  code: string;
  message: string;
  timestamp: string;
  correlationId?: string;
  workflowId?: WorkflowId;
  taskId?: TaskId;
  agentType?: AgentType;
  stackTrace?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Handler Context Types
// ============================================================================

export interface HandlerContext {
  correlationId: string;
  workflowId?: WorkflowId;
  taskId?: TaskId;
  user?: {
    id: string;
    roles?: string[];
  };
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isWorkflowEvent(event: SystemEvent): event is WorkflowEvent {
  return 'workflowId' in event;
}

export function isTaskEvent(event: SystemEvent): event is TaskEvent {
  return 'taskId' in event && 'workflowId' in event;
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as ApiError).message === 'string'
  );
}

export function isValidationResult(result: unknown): result is ValidationResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'valid' in result &&
    typeof (result as ValidationResult).valid === 'boolean'
  );
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncResult<T> = Promise<T>;
export type Callback<T = void> = (error?: Error | null, result?: T) => void;

// ============================================================================
// Export Type Maps for Easy Access
// ============================================================================

export const TypeMaps = {
  isSystemEvent: (obj: unknown): obj is SystemEvent => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'type' in obj &&
      'timestamp' in obj &&
      'data' in obj
    );
  },

  isCommand: (obj: unknown): obj is Command => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'type' in obj &&
      'payload' in obj
    );
  },

  isQuery: (obj: unknown): obj is Query => {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'type' in obj
    );
  }
};