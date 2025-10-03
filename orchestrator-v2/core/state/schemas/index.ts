import { z } from 'zod';

export const WorkflowIdSchema = z.string().uuid();
export const TaskIdSchema = z.string().uuid();
export const AgentNameSchema = z.string().min(1).max(100);
export const EventIdSchema = z.string().uuid();
export const CorrelationIdSchema = z.string().uuid();

export const WorkflowStatusSchema = z.enum([
  'pending',
  'initializing',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'timeout'
]);

export const TaskStatusSchema = z.enum([
  'pending',
  'assigned',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
  'timeout',
  'retry'
]);

export const AgentStatusSchema = z.enum([
  'idle',
  'loading',
  'ready',
  'executing',
  'completed',
  'failed',
  'timeout'
]);

export const ComplexityLevelSchema = z.enum(['simple', 'moderate', 'complex']);

export const TaskStateSchema = z.object({
  id: TaskIdSchema,
  workflowId: WorkflowIdSchema,
  agentName: AgentNameSchema,
  complexity: ComplexityLevelSchema,
  status: TaskStatusSchema,
  description: z.string(),
  input: z.any().optional(),
  output: z.any().optional(),
  error: z.union([z.instanceof(Error), z.string()]).optional(),
  retryCount: z.number().int().min(0),
  maxRetries: z.number().int().min(0).max(10),
  timeout: z.number().positive(),
  priority: z.number().int(),
  dependencies: z.array(TaskIdSchema),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  metadata: z.record(z.any())
});

export const AgentStateSchema = z.object({
  name: AgentNameSchema,
  complexity: ComplexityLevelSchema,
  status: AgentStatusSchema,
  currentTaskId: TaskIdSchema.optional(),
  capabilities: z.array(z.string()),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  loadedAt: z.date().optional(),
  lastActiveAt: z.date().optional(),
  executionCount: z.number().int().min(0),
  successCount: z.number().int().min(0),
  failureCount: z.number().int().min(0),
  averageExecutionTime: z.number().min(0),
  metadata: z.record(z.any())
});

export const CheckpointSchema = z.object({
  id: z.string().uuid(),
  workflowId: WorkflowIdSchema,
  taskId: TaskIdSchema,
  state: z.record(z.any()),
  createdAt: z.date(),
  metadata: z.record(z.any())
});

export const WorkflowStateSchema = z.object({
  id: WorkflowIdSchema,
  name: z.string().min(1).max(200),
  description: z.string(),
  status: WorkflowStatusSchema,
  tasks: z.map(TaskIdSchema, TaskStateSchema),
  agents: z.map(AgentNameSchema, AgentStateSchema),
  currentTaskId: TaskIdSchema.optional(),
  taskOrder: z.array(TaskIdSchema),
  context: z.record(z.any()),
  variables: z.record(z.any()),
  checkpoints: z.array(CheckpointSchema),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  lastModifiedAt: z.date(),
  createdBy: z.string(),
  tags: z.array(z.string()),
  metadata: z.record(z.any())
});

export const SystemMetricsSchema = z.object({
  totalWorkflows: z.number().int().min(0),
  activeWorkflows: z.number().int().min(0),
  completedWorkflows: z.number().int().min(0),
  failedWorkflows: z.number().int().min(0),
  totalTasks: z.number().int().min(0),
  completedTasks: z.number().int().min(0),
  failedTasks: z.number().int().min(0),
  averageWorkflowDuration: z.number().min(0),
  averageTaskDuration: z.number().min(0),
  agentUtilization: z.map(AgentNameSchema, z.number().min(0).max(1)),
  errorRate: z.number().min(0).max(1),
  throughput: z.number().min(0),
  lastUpdated: z.date()
});

export const EventMetadataSchema = z.object({
  source: z.string(),
  userId: z.string().optional(),
  workflowId: WorkflowIdSchema.optional(),
  taskId: TaskIdSchema.optional(),
  agentName: AgentNameSchema.optional(),
  version: z.string(),
  retryCount: z.number().int().min(0).optional(),
  parentEventId: EventIdSchema.optional(),
  tags: z.array(z.string()).optional()
}).catchall(z.any());

export const StateEventSchema = z.object({
  id: EventIdSchema,
  correlationId: CorrelationIdSchema,
  type: z.string().min(1),
  payload: z.any(),
  metadata: EventMetadataSchema,
  timestamp: z.date()
});

export const CommandMetadataSchema = z.object({
  correlationId: CorrelationIdSchema,
  userId: z.string().optional(),
  workflowId: WorkflowIdSchema.optional(),
  expectedVersion: z.number().int().optional(),
  timeout: z.number().positive().optional(),
  priority: z.number().int().optional()
});

export const CommandSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  payload: z.any(),
  metadata: CommandMetadataSchema,
  timestamp: z.date()
});

export const QueryMetadataSchema = z.object({
  correlationId: CorrelationIdSchema,
  userId: z.string().optional(),
  includeDeleted: z.boolean().optional(),
  asOf: z.date().optional(),
  timeout: z.number().positive().optional()
});

export const PaginationParamsSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
});

export const QuerySchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  criteria: z.any(),
  projection: z.array(z.string()).optional(),
  pagination: PaginationParamsSchema.optional(),
  metadata: QueryMetadataSchema
});

export const ResultMetadataSchema = z.object({
  queryId: z.string().uuid(),
  timestamp: z.date(),
  totalRecords: z.number().int().min(0).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
  cached: z.boolean().optional()
});

export const QueryResultSchema = z.object({
  data: z.any(),
  metadata: ResultMetadataSchema
});

export const SnapshotMetadataSchema = z.object({
  reason: z.string(),
  userId: z.string().optional(),
  automated: z.boolean(),
  compressed: z.boolean(),
  checksum: z.string(),
  sizeBytes: z.number().int().positive()
});

export const StateSnapshotSchema = z.object({
  id: z.string().uuid(),
  state: z.any(),
  version: z.number().int().positive(),
  createdAt: z.date(),
  metadata: SnapshotMetadataSchema
});

export const CreateWorkflowCommandSchema = CommandSchema.extend({
  type: z.literal('CreateWorkflow'),
  payload: z.object({
    id: WorkflowIdSchema.optional(),
    name: z.string().min(1).max(200),
    description: z.string().optional(),
    context: z.record(z.any()).optional(),
    variables: z.record(z.any()).optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional()
  })
});

export const UpdateWorkflowStatusCommandSchema = CommandSchema.extend({
  type: z.literal('UpdateWorkflowStatus'),
  payload: z.object({
    workflowId: WorkflowIdSchema,
    status: WorkflowStatusSchema,
    reason: z.string().optional()
  })
});

export const CreateTaskCommandSchema = CommandSchema.extend({
  type: z.literal('CreateTask'),
  payload: z.object({
    id: TaskIdSchema.optional(),
    workflowId: WorkflowIdSchema,
    agentName: AgentNameSchema,
    complexity: ComplexityLevelSchema.optional(),
    description: z.string(),
    input: z.any().optional(),
    maxRetries: z.number().int().min(0).max(10).optional(),
    timeout: z.number().positive().optional(),
    priority: z.number().int().optional(),
    dependencies: z.array(TaskIdSchema).optional(),
    metadata: z.record(z.any()).optional()
  })
});

export const UpdateTaskStatusCommandSchema = CommandSchema.extend({
  type: z.literal('UpdateTaskStatus'),
  payload: z.object({
    taskId: TaskIdSchema,
    status: TaskStatusSchema,
    output: z.any().optional(),
    error: z.union([z.string(), z.object({
      message: z.string(),
      stack: z.string().optional(),
      code: z.string().optional()
    })]).optional()
  })
});

export const AssignAgentCommandSchema = CommandSchema.extend({
  type: z.literal('AssignAgent'),
  payload: z.object({
    agentName: AgentNameSchema,
    taskId: TaskIdSchema,
    workflowId: WorkflowIdSchema
  })
});

export const UpdateAgentStatusCommandSchema = CommandSchema.extend({
  type: z.literal('UpdateAgentStatus'),
  payload: z.object({
    agentName: AgentNameSchema,
    status: AgentStatusSchema,
    metadata: z.record(z.any()).optional()
  })
});

export const CompleteWorkflowCommandSchema = CommandSchema.extend({
  type: z.literal('CompleteWorkflow'),
  payload: z.object({
    workflowId: WorkflowIdSchema,
    result: z.any().optional()
  })
});

export const FailWorkflowCommandSchema = CommandSchema.extend({
  type: z.literal('FailWorkflow'),
  payload: z.object({
    workflowId: WorkflowIdSchema,
    error: z.union([z.string(), z.object({
      message: z.string(),
      stack: z.string().optional(),
      code: z.string().optional()
    })])
  })
});

export const CancelWorkflowCommandSchema = CommandSchema.extend({
  type: z.literal('CancelWorkflow'),
  payload: z.object({
    workflowId: WorkflowIdSchema,
    reason: z.string()
  })
});

export const GetWorkflowQuerySchema = QuerySchema.extend({
  type: z.literal('GetWorkflow'),
  criteria: z.object({
    workflowId: WorkflowIdSchema
  })
});

export const GetTaskQuerySchema = QuerySchema.extend({
  type: z.literal('GetTask'),
  criteria: z.object({
    taskId: TaskIdSchema
  })
});

export const GetAgentQuerySchema = QuerySchema.extend({
  type: z.literal('GetAgent'),
  criteria: z.object({
    agentName: AgentNameSchema
  })
});

export const GetActiveWorkflowsQuerySchema = QuerySchema.extend({
  type: z.literal('GetActiveWorkflows'),
  criteria: z.object({
    limit: z.number().int().positive().optional(),
    offset: z.number().int().min(0).optional()
  }).optional()
});

export const GetWorkflowsByStatusQuerySchema = QuerySchema.extend({
  type: z.literal('GetWorkflowsByStatus'),
  criteria: z.object({
    status: WorkflowStatusSchema,
    limit: z.number().int().positive().optional(),
    offset: z.number().int().min(0).optional()
  })
});

export const GetMetricsQuerySchema = QuerySchema.extend({
  type: z.literal('GetMetrics'),
  criteria: z.object({
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    aggregation: z.enum(['hour', 'day', 'week', 'month']).optional()
  }).optional()
});

export const GetTaskQueueQuerySchema = QuerySchema.extend({
  type: z.literal('GetTaskQueue'),
  criteria: z.object({
    limit: z.number().int().positive().optional(),
    priorityThreshold: z.number().int().optional()
  }).optional()
});

export const GetAgentUtilizationQuerySchema = QuerySchema.extend({
  type: z.literal('GetAgentUtilization'),
  criteria: z.object({
    agentNames: z.array(AgentNameSchema).optional(),
    includeIdle: z.boolean().optional()
  }).optional()
});

export type WorkflowId = z.infer<typeof WorkflowIdSchema>;
export type TaskId = z.infer<typeof TaskIdSchema>;
export type AgentName = z.infer<typeof AgentNameSchema>;
export type EventId = z.infer<typeof EventIdSchema>;
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type ComplexityLevel = z.infer<typeof ComplexityLevelSchema>;
export type TaskState = z.infer<typeof TaskStateSchema>;
export type AgentState = z.infer<typeof AgentStateSchema>;
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
export type SystemMetrics = z.infer<typeof SystemMetricsSchema>;
export type StateEvent = z.infer<typeof StateEventSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type Query = z.infer<typeof QuerySchema>;
export type QueryResult = z.infer<typeof QueryResultSchema>;
export type StateSnapshot = z.infer<typeof StateSnapshotSchema>;