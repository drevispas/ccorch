import { z } from 'zod';
import {
  WorkflowIdSchema,
  TaskIdSchema,
  TimestampSchema,
  ComplexityLevelSchema,
  WorkflowStatusSchema,
  TaskStatusSchema,
  TodoSchema,
  AgentTypeSchema,
  WorkflowTypeSchema
} from './common';

// ============================================================================
// Request Schemas
// ============================================================================

// POST /api/init
export const InitRequestSchema = z.object({
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  enableMetrics: z.boolean().optional()
});

// POST /api/parse-command
export const ParseCommandRequestSchema = z.object({
  command: z.string().min(1, 'Command cannot be empty')
});

// POST /api/execute
export const ExecuteWorkflowRequestSchema = z.object({
  workflowType: WorkflowTypeSchema,
  taskDescription: z.string().min(1, 'Task description cannot be empty'),
  parsedCommand: z.object({
    workflowType: WorkflowTypeSchema,
    taskDescription: z.string(),
    parameters: z.record(z.unknown()).optional()
  }).optional(),
  projectDirectory: z.string().optional(),
  complexity: ComplexityLevelSchema.optional()
});

// POST /api/agent-result
export const AgentResultRequestSchema = z.object({
  taskId: TaskIdSchema,
  result: z.any(), // Agent results can be of any type
  success: z.boolean().default(true),
  agentType: AgentTypeSchema.optional()
});

// POST /api/recover-workflow/:workflowId
export const RecoverWorkflowRequestSchema = z.object({
  force: z.boolean().optional()
});

// POST /api/reset-task/:taskId
export const ResetTaskRequestSchema = z.object({
  reason: z.string().optional()
});

// ============================================================================
// Response Schemas
// ============================================================================

// POST /api/init response
export const InitResponseSchema = z.object({
  status: z.literal('initialized'),
  availableWorkflows: z.array(WorkflowTypeSchema),
  timestamp: TimestampSchema
});

// POST /api/parse-command response
export const ParseCommandResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    parsedCommand: z.object({
      workflowType: WorkflowTypeSchema,
      taskDescription: z.string(),
      parameters: z.record(z.unknown()).optional()
    }),
    available: z.boolean()
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    suggestions: z.array(z.string()).optional()
  })
]);

// POST /api/execute response
export const ExecuteWorkflowResponseSchema = z.object({
  workflowId: WorkflowIdSchema,
  status: z.literal('started'),
  workflowType: WorkflowTypeSchema,
  taskDescription: z.string()
});

// GET /api/todos/:workflowId response
export const TodosResponseSchema = z.object({
  todos: z.array(TodoSchema)
});

// GET /api/next-todo/:workflowId response
export const NextTodoResponseSchema = z.union([
  z.object({
    todo: TodoSchema,
    allTodos: z.array(TodoSchema),
    workflowId: WorkflowIdSchema
  }),
  z.object({
    todo: z.null(),
    message: z.string(),
    allTodos: z.array(TodoSchema),
    workflowId: WorkflowIdSchema
  })
]);

// Task parameters schema
export const TaskParamsSchema = z.object({
  subagent_type: AgentTypeSchema,
  description: z.string(),
  prompt: z.string(),
  projectDirectory: z.string().optional(),
  complexity: ComplexityLevelSchema.optional(),
  context: z.record(z.unknown()).optional()
});

// GET /api/next-task/:workflowId response
export const NextTaskResponseSchema = z.union([
  z.object({
    taskId: TaskIdSchema,
    params: TaskParamsSchema,
    timestamp: TimestampSchema
  }),
  z.object({
    taskId: z.null(),
    message: z.string()
  })
]);

// POST /api/agent-result response
export const AgentResultResponseSchema = z.object({
  status: z.literal('received'),
  taskId: TaskIdSchema,
  success: z.boolean(),
  workflowId: WorkflowIdSchema,
  nextTask: z.union([
    z.object({
      taskId: TaskIdSchema,
      params: TaskParamsSchema,
      timestamp: TimestampSchema
    }),
    z.null()
  ])
});

// GET /api/status/:workflowId response
export const WorkflowStatusResponseSchema = z.object({
  id: WorkflowIdSchema,
  workflowType: WorkflowTypeSchema,
  taskDescription: z.string(),
  status: WorkflowStatusSchema,
  startTime: TimestampSchema,
  endTime: TimestampSchema.optional(),
  parsedCommand: z.object({
    workflowType: WorkflowTypeSchema,
    taskDescription: z.string(),
    parameters: z.record(z.unknown()).optional()
  }).optional(),
  pendingTaskId: TaskIdSchema.nullable(),
  completedTasks: z.array(z.object({
    taskId: TaskIdSchema,
    agentType: AgentTypeSchema,
    success: z.boolean(),
    completedAt: TimestampSchema
  })),
  projectDirectory: z.string(),
  complexity: ComplexityLevelSchema,
  complexityAnalysis: z.object({
    complexity: ComplexityLevelSchema,
    indicators: z.array(z.string()),
    score: z.number()
  }).optional(),
  pendingTasks: z.number(),
  hasPendingTodos: z.boolean(),
  error: z.string().optional()
});

// GET /api/workflows response
export const WorkflowsListResponseSchema = z.object({
  workflows: z.array(z.object({
    workflowId: WorkflowIdSchema
  }).merge(WorkflowStatusResponseSchema.omit({ id: true })))
});

// GET /api/health response
export const HealthCheckResponseSchema = z.object({
  status: z.literal('healthy'),
  initialized: z.boolean(),
  activeWorkflows: z.number().min(0),
  pendingTasks: z.number().min(0),
  pendingTodos: z.number().min(0),
  currentWorkflowId: WorkflowIdSchema.nullable(),
  websocket: z.object({
    running: z.boolean(),
    connections: z.number().min(0),
    port: z.union([z.string(), z.number()])
  }).optional(),
  timestamp: TimestampSchema
});

// Debug endpoint schemas
export const DebugWorkflowsResponseSchema = z.object({
  active: z.array(z.tuple([WorkflowIdSchema, z.any()])),
  pendingTodos: z.array(z.tuple([WorkflowIdSchema, z.array(TodoSchema)])),
  pendingTasks: z.array(z.tuple([TaskIdSchema, z.any()])),
  currentWorkflowId: WorkflowIdSchema.nullable(),
  timestamp: TimestampSchema
});

export const DebugWorkflowDetailResponseSchema = z.object({
  workflow: WorkflowStatusResponseSchema,
  todos: z.array(TodoSchema),
  tasks: z.array(z.object({
    taskId: TaskIdSchema,
    workflowId: WorkflowIdSchema,
    params: TaskParamsSchema,
    timestamp: TimestampSchema,
    status: TaskStatusSchema,
    result: z.any().optional(),
    success: z.boolean().optional(),
    completedTime: TimestampSchema.optional(),
    hasPromise: z.boolean(),
    hasTimeout: z.boolean()
  })),
  timestamp: TimestampSchema
});

export const DebugTaskResponseSchema = z.object({
  task: z.object({
    workflowId: WorkflowIdSchema,
    params: TaskParamsSchema,
    timestamp: TimestampSchema,
    status: TaskStatusSchema,
    result: z.any().optional(),
    success: z.boolean().optional(),
    completedTime: TimestampSchema.optional(),
    resetTime: TimestampSchema.optional(),
    hasPromise: z.boolean(),
    hasTimeout: z.boolean()
  }),
  workflow: WorkflowStatusResponseSchema.optional(),
  timestamp: TimestampSchema
});

// Recovery endpoint response schemas
export const RecoverWorkflowResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  lastCompletedAgent: AgentTypeSchema.optional()
});

export const ResetTaskResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  taskId: TaskIdSchema,
  agentType: AgentTypeSchema
});

// ============================================================================
// Type Exports
// ============================================================================

export type InitRequest = z.infer<typeof InitRequestSchema>;
export type InitResponse = z.infer<typeof InitResponseSchema>;

export type ParseCommandRequest = z.infer<typeof ParseCommandRequestSchema>;
export type ParseCommandResponse = z.infer<typeof ParseCommandResponseSchema>;

export type ExecuteWorkflowRequest = z.infer<typeof ExecuteWorkflowRequestSchema>;
export type ExecuteWorkflowResponse = z.infer<typeof ExecuteWorkflowResponseSchema>;

export type AgentResultRequest = z.infer<typeof AgentResultRequestSchema>;
export type AgentResultResponse = z.infer<typeof AgentResultResponseSchema>;

export type TodosResponse = z.infer<typeof TodosResponseSchema>;
export type NextTodoResponse = z.infer<typeof NextTodoResponseSchema>;
export type NextTaskResponse = z.infer<typeof NextTaskResponseSchema>;

export type WorkflowStatusResponse = z.infer<typeof WorkflowStatusResponseSchema>;
export type WorkflowsListResponse = z.infer<typeof WorkflowsListResponseSchema>;
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

export type TaskParams = z.infer<typeof TaskParamsSchema>;

export type DebugWorkflowsResponse = z.infer<typeof DebugWorkflowsResponseSchema>;
export type DebugWorkflowDetailResponse = z.infer<typeof DebugWorkflowDetailResponseSchema>;
export type DebugTaskResponse = z.infer<typeof DebugTaskResponseSchema>;

export type RecoverWorkflowResponse = z.infer<typeof RecoverWorkflowResponseSchema>;
export type ResetTaskResponse = z.infer<typeof ResetTaskResponseSchema>;