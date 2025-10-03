import { EventEmitter } from 'events';
import {
  WorkflowId,
  TaskId,
  WorkflowStatus,
  TaskStatus,
  ComplexityLevel,
  AgentType,
  WorkflowType,
  Todo
} from '../schemas/common';
import { TaskParams } from '../schemas/api';
import { ComplexityAnalysis } from '../../core/complexity-detector';
import { ParsedCommand } from '../../core/command-parser';

// Re-export enhanced types
export * from './enhanced.types';

export { TaskParams, ComplexityAnalysis, ParsedCommand };

// ============================================================================
// Base Types
// ============================================================================

// Define a generic result type for agent outputs
export type AgentResult = {
  status: 'success' | 'failure' | 'partial';
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
};

// Define a proper task result type
export type TaskResult = {
  output: unknown;
  metrics?: Record<string, number>;
  logs?: string[];
};

// Define workflow context type
export type WorkflowContext = {
  variables: Record<string, unknown>;
  previousResults: AgentResult[];
  metadata: Record<string, unknown>;
};

// ============================================================================
// Workflow Types
// ============================================================================

export interface CompletedTask {
  taskId: TaskId;
  agentType: AgentType;
  success: boolean;
  completedAt: string;
}

export interface WorkflowState {
  id: WorkflowId;
  workflowType: WorkflowType;
  taskDescription: string;
  status: WorkflowStatus;
  startTime: string;
  endTime?: string;
  parsedCommand?: ParsedCommand;
  pendingTaskId: TaskId | null;
  completedTasks: CompletedTask[];
  currentWorkflowId: WorkflowId;
  projectDirectory: string;
  complexity: ComplexityLevel;
  complexityAnalysis?: ComplexityAnalysis;
  error?: string;
}

// ============================================================================
// Task Types
// ============================================================================

export interface TaskPromise {
  resolve: (value: TaskResult) => void;
  reject: (error: Error) => void;
}

export interface PendingTask {
  workflowId: WorkflowId;
  params: TaskParams;
  timestamp: string;
  status: TaskStatus;
  promise: TaskPromise | null;
  timeoutId: NodeJS.Timeout | null;
  result?: TaskResult;
  success?: boolean;
  completedTime?: string;
  resetTime?: string;
  createdTime?: string;
}

// ============================================================================
// Server State Types
// ============================================================================

export interface ServerState {
  activeWorkflows: Map<WorkflowId, WorkflowState>;
  pendingTodos: Map<WorkflowId, Todo[]>;
  pendingTasks: Map<TaskId, PendingTask>;
  taskTimeouts: Map<TaskId, NodeJS.Timeout>;
  taskNotifier: EventEmitter;
  currentWorkflowId: WorkflowId | null;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface OrchestratorConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enableMetrics: boolean;
  maxConcurrentAgents: number;
  timeouts?: {
    claudeIntegration?: {
      agentExecutionTimeout?: number;
    };
  };
}

// ============================================================================
// Callback Types
// ============================================================================

export type TodoWriteCallback = (todos: Todo[]) => Promise<void>;

export type TaskCallback = (params: TaskParams) => Promise<{
  success: boolean;
  result: string;
  taskId: string;
  agentType: string;
  duration: number;
}>;

// ============================================================================
// Event Types
// ============================================================================

export interface TaskReadyEvent {
  taskId: TaskId;
  workflowId: WorkflowId;
  agentType: AgentType;
}

// ============================================================================
// File Management Types
// ============================================================================

export interface AgentResultFile {
  workflowId: WorkflowId;
  stepIndex: number;
  agentName: AgentType;
  result: AgentResult;
  timestamp: string;
  description?: string;
}

export interface HandoverDocument {
  workflowId: WorkflowId;
  fromAgent: AgentType;
  toAgent: AgentType;
  stepIndex: number;
  context: WorkflowContext;
  previousResults: AgentResultFile[];
}

export interface ResultPaths {
  resultDir: string;
  resultFile: string;
  handoverFile?: string;
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentDefinition {
  name: AgentType;
  complexity?: ComplexityLevel;
  capabilities: string[];
  description: string;
}

export interface WorkflowDefinition {
  name: WorkflowType;
  description: string;
  agents: {
    sequence: AgentDefinition[];
  };
  timeout?: number;
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;

// ============================================================================
// Response Builder Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: Record<string, unknown>;
  correlationId?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}