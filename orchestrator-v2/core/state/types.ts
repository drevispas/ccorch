import { z } from 'zod';
import {
  SortOrder,
  ComplexityLevel,
  WorkflowStatus,
  TaskStatus,
  AgentStatus
} from '../enums';

export type WorkflowId = string;
export type TaskId = string;
export type AgentName = string;
export type EventId = string;
export type CorrelationId = string;

// Re-export enums for backward compatibility
export { ComplexityLevel, WorkflowStatus, TaskStatus, AgentStatus };

export interface TaskState {
  id: TaskId;
  workflowId: WorkflowId;
  agentName: AgentName;
  complexity: ComplexityLevel;
  status: TaskStatus;
  description: string;
  input?: any;
  output?: any;
  error?: Error | string;
  retryCount: number;
  maxRetries: number;
  timeout: number;
  priority: number;
  dependencies: TaskId[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  metadata: Record<string, any>;
}

export interface AgentState {
  name: AgentName;
  complexity: ComplexityLevel;
  status: AgentStatus;
  currentTaskId?: TaskId;
  capabilities: string[];
  version: string;
  loadedAt?: Date;
  lastActiveAt?: Date;
  executionCount: number;
  successCount: number;
  failureCount: number;
  averageExecutionTime: number;
  metadata: Record<string, any>;
}

export interface WorkflowState {
  id: WorkflowId;
  name: string;
  description: string;
  status: WorkflowStatus;
  tasks: Map<TaskId, TaskState>;
  agents: Map<AgentName, AgentState>;
  currentTaskId?: TaskId;
  taskOrder: TaskId[];
  context: Record<string, any>;
  variables: Record<string, any>;
  checkpoints: Checkpoint[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
  lastModifiedAt: Date;
  createdBy: string;
  tags: string[];
  metadata: Record<string, any>;
}

export interface Checkpoint {
  id: string;
  workflowId: WorkflowId;
  taskId: TaskId;
  state: Partial<WorkflowState>;
  createdAt: Date;
  metadata: Record<string, any>;
}

export interface OrchestratorState {
  workflows: Map<WorkflowId, WorkflowState>;
  activeWorkflows: Set<WorkflowId>;
  completedWorkflows: Set<WorkflowId>;
  taskQueue: PriorityQueue<TaskState>;
  agentPool: Map<AgentName, AgentState>;
  globalContext: Record<string, any>;
  metrics: SystemMetrics;
}

export interface SystemMetrics {
  totalWorkflows: number;
  activeWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageWorkflowDuration: number;
  averageTaskDuration: number;
  agentUtilization: Map<AgentName, number>;
  errorRate: number;
  throughput: number;
  lastUpdated: Date;
}

export interface StateEvent {
  id: EventId;
  correlationId: CorrelationId;
  type: string;
  payload: any;
  metadata: EventMetadata;
  timestamp: Date;
}

export interface EventMetadata {
  source: string;
  userId?: string;
  workflowId?: WorkflowId;
  taskId?: TaskId;
  agentName?: AgentName;
  version: string;
  retryCount?: number;
  parentEventId?: EventId;
  tags?: string[];
  [key: string]: any;
}

export interface Command {
  id: string;
  type: string;
  payload: any;
  metadata: CommandMetadata;
  timestamp: Date;
}

export interface CommandMetadata {
  correlationId: CorrelationId;
  userId?: string;
  workflowId?: WorkflowId;
  expectedVersion?: number;
  timeout?: number;
  priority?: number;
  timestamp?: Date;
}

export interface Query {
  id: string;
  type: string;
  criteria: any;
  projection?: string[];
  pagination?: PaginationParams;
  metadata: QueryMetadata;
}

export interface QueryMetadata {
  correlationId: CorrelationId;
  userId?: string;
  includeDeleted?: boolean;
  asOf?: Date;
  timeout?: number;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface QueryResult<T = any> {
  data: T;
  metadata: ResultMetadata;
}

export interface ResultMetadata {
  queryId: string;
  timestamp: Date;
  totalRecords?: number;
  page?: number;
  pageSize?: number;
  cached?: boolean;
  executionTime?: number;
  [key: string]: any;
}

export interface StateSnapshot {
  id: string;
  state: OrchestratorState;
  version: number;
  createdAt: Date;
  metadata: SnapshotMetadata;
}

export interface SnapshotMetadata {
  reason: string;
  userId?: string;
  automated: boolean;
  compressed: boolean;
  checksum: string;
  sizeBytes: number;
}

export class PriorityQueue<T> {
  private items: Array<{ priority: number; value: T }> = [];

  enqueue(value: T, priority: number): void {
    this.items.push({ priority, value });
    this.items.sort((a, b) => b.priority - a.priority);
  }

  dequeue(): T | undefined {
    const item = this.items.shift();
    return item?.value;
  }

  peek(): T | undefined {
    return this.items[0]?.value;
  }

  get size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  clear(): void {
    this.items = [];
  }

  toArray(): T[] {
    return this.items.map(item => item.value);
  }
}