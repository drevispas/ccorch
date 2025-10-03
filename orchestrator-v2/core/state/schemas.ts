import { z } from 'zod';
import {
  WorkflowStatus,
  TaskStatus,
  AgentStatus,
  ComplexityLevel,
} from './types';

// Enum schemas
export const WorkflowStatusSchema = z.nativeEnum(WorkflowStatus);
export const TaskStatusSchema = z.nativeEnum(TaskStatus);
export const AgentStatusSchema = z.nativeEnum(AgentStatus);
export const ComplexityLevelSchema = z.nativeEnum(ComplexityLevel);

// Task schemas
export const TaskStateSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  agentName: z.string(),
  complexity: ComplexityLevelSchema,
  status: TaskStatusSchema,
  description: z.string(),
  input: z.any().optional(),
  output: z.any().optional(),
  error: z.union([z.instanceof(Error), z.string()]).optional(),
  retryCount: z.number().min(0),
  maxRetries: z.number().min(0),
  timeout: z.number().positive(),
  priority: z.number(),
  dependencies: z.array(z.string()),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  metadata: z.record(z.any()),
});

// Agent schemas
export const AgentStateSchema = z.object({
  name: z.string(),
  complexity: ComplexityLevelSchema,
  status: AgentStatusSchema,
  currentTaskId: z.string().optional(),
  capabilities: z.array(z.string()),
  version: z.string(),
  loadedAt: z.date().optional(),
  lastActiveAt: z.date().optional(),
  executionCount: z.number().min(0),
  successCount: z.number().min(0),
  failureCount: z.number().min(0),
  averageExecutionTime: z.number().min(0),
  metadata: z.record(z.any()),
});

// Checkpoint schema
export const CheckpointSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  taskId: z.string(),
  state: z.record(z.any()), // Partial<WorkflowState>
  createdAt: z.date(),
  metadata: z.record(z.any()),
});

// Workflow schema
export const WorkflowStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: WorkflowStatusSchema,
  tasks: z.map(z.string(), TaskStateSchema),
  agents: z.map(z.string(), AgentStateSchema),
  currentTaskId: z.string().optional(),
  taskOrder: z.array(z.string()),
  context: z.record(z.any()),
  variables: z.record(z.any()),
  checkpoints: z.array(CheckpointSchema),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  updatedAt: z.date(),
  lastModifiedAt: z.date(),
  createdBy: z.string(),
  tags: z.array(z.string()),
  metadata: z.record(z.any()),
});

// System metrics schema
export const SystemMetricsSchema = z.object({
  totalWorkflows: z.number().min(0),
  activeWorkflows: z.number().min(0),
  completedWorkflows: z.number().min(0),
  failedWorkflows: z.number().min(0),
  totalTasks: z.number().min(0),
  completedTasks: z.number().min(0),
  failedTasks: z.number().min(0),
  averageWorkflowDuration: z.number().min(0),
  averageTaskDuration: z.number().min(0),
  agentUtilization: z.map(z.string(), z.number()),
  errorRate: z.number().min(0).max(1),
  throughput: z.number().min(0),
  lastUpdated: z.date(),
});

// Event schemas
export const EventMetadataSchema = z.object({
  source: z.string(),
  userId: z.string().optional(),
  workflowId: z.string().optional(),
  taskId: z.string().optional(),
  agentName: z.string().optional(),
  version: z.string(),
  retryCount: z.number().optional(),
  parentEventId: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).catchall(z.any());

export const StateEventSchema = z.object({
  id: z.string(),
  correlationId: z.string(),
  type: z.string(),
  payload: z.any(),
  metadata: EventMetadataSchema,
  timestamp: z.date(),
});

// Command schemas
export const CommandMetadataSchema = z.object({
  correlationId: z.string(),
  userId: z.string().optional(),
  workflowId: z.string().optional(),
  expectedVersion: z.number().optional(),
  timeout: z.number().optional(),
  priority: z.number().optional(),
});

export const CommandSchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.any(),
  metadata: CommandMetadataSchema,
  timestamp: z.date(),
});

// Query schemas
export const PaginationParamsSchema = z.object({
  page: z.number().positive(),
  pageSize: z.number().positive(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const QueryMetadataSchema = z.object({
  correlationId: z.string(),
  userId: z.string().optional(),
  includeDeleted: z.boolean().optional(),
  asOf: z.date().optional(),
  timeout: z.number().optional(),
});

export const QuerySchema = z.object({
  id: z.string(),
  type: z.string(),
  criteria: z.any(),
  projection: z.array(z.string()).optional(),
  pagination: PaginationParamsSchema.optional(),
  metadata: QueryMetadataSchema,
});

// Result schemas
export const ResultMetadataSchema = z.object({
  queryId: z.string(),
  timestamp: z.date(),
  totalRecords: z.number().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  cached: z.boolean().optional(),
  executionTime: z.number().optional(),
}).catchall(z.any());

export const QueryResultSchema = z.object({
  data: z.any(),
  metadata: ResultMetadataSchema,
});

// Snapshot schemas
export const SnapshotMetadataSchema = z.object({
  reason: z.string(),
  userId: z.string().optional(),
  automated: z.boolean(),
  compressed: z.boolean(),
  checksum: z.string(),
  sizeBytes: z.number().positive(),
});

export const StateSnapshotSchema = z.object({
  id: z.string(),
  state: z.any(), // OrchestratorState - complex nested structure
  version: z.number().positive(),
  createdAt: z.date(),
  metadata: SnapshotMetadataSchema,
});

// Input validation schemas for API
export const CreateWorkflowInputSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  tasks: z.array(z.object({
    id: z.string(),
    agentName: z.string(),
    complexity: ComplexityLevelSchema,
    description: z.string(),
    input: z.any().optional(),
    dependencies: z.array(z.string()).optional(),
    timeout: z.number().positive().optional(),
    priority: z.number().optional(),
  })),
  context: z.record(z.any()).optional(),
  variables: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

export const UpdateWorkflowInputSchema = z.object({
  status: WorkflowStatusSchema.optional(),
  context: z.record(z.any()).optional(),
  variables: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

export const UpdateTaskInputSchema = z.object({
  status: TaskStatusSchema.optional(),
  output: z.any().optional(),
  error: z.string().optional(),
});

// Validation helper functions
export function validateWorkflowState(data: unknown) {
  return WorkflowStateSchema.parse(data);
}

export function validateTaskState(data: unknown) {
  return TaskStateSchema.parse(data);
}

export function validateAgentState(data: unknown) {
  return AgentStateSchema.parse(data);
}

export function validateStateEvent(data: unknown) {
  return StateEventSchema.parse(data);
}

export function validateCommand(data: unknown) {
  return CommandSchema.parse(data);
}

export function validateQuery(data: unknown) {
  return QuerySchema.parse(data);
}