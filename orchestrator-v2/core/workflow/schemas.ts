import { z } from 'zod';
import {
  StageType,
  ErrorStrategy,
  RetryStrategy,
  TriggerType,
  ComplexityLevel,
  ValidationResult as ValidationResultType
} from './types';
import { ValidationSeverity } from '../enums';

// =====================
// Basic Type Schemas
// =====================

export const StageIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const WorkflowIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const WorkflowVersionSchema = z.string().regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/);
export const VariableNameSchema = z.string().min(1).max(100).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
export const AgentNameSchema = z.string().min(1).max(100);

// =====================
// Enum Schemas
// =====================

export const StageTypeSchema = z.nativeEnum(StageType);
export const ErrorStrategySchema = z.nativeEnum(ErrorStrategy);
export const RetryStrategySchema = z.nativeEnum(RetryStrategy);
export const TriggerTypeSchema = z.nativeEnum(TriggerType);
export const ComplexityLevelSchema = z.enum(['simple', 'moderate', 'complex']);

// =====================
// Metadata Schemas
// =====================

export const WorkflowMetadataSchema = z.object({
  id: WorkflowIdSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(1000),
  version: WorkflowVersionSchema,
  author: z.string().min(1).max(255),
  tags: z.array(z.string()).default([]),
  created: z.date().default(() => new Date()),
  updated: z.date().default(() => new Date()),
  deprecated: z.boolean().optional(),
  expiresAt: z.date().optional(),
});

// =====================
// Trigger Schemas
// =====================

export const WorkflowTriggerSchema = z.object({
  type: TriggerTypeSchema,
  config: z.object({
    schedule: z.string().optional(), // cron expression
    event: z.string().optional(),
    webhook: z.object({
      url: z.string().url(),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
      headers: z.record(z.string()).optional(),
    }).optional(),
    filePath: z.string().optional(),
    condition: z.string().optional(),
  }),
  enabled: z.boolean().default(true),
});

// =====================
// Configuration Schemas
// =====================

export const TimeoutConfigSchema = z.object({
  global: z.number().min(0).optional(),
  perStage: z.record(StageIdSchema, z.number().min(0)).optional(),
  perTask: z.record(z.string(), z.number().min(0)).optional(),
  gracefulShutdown: z.number().min(0).optional(),
});

export const RetryConfigSchema = z.object({
  strategy: RetryStrategySchema,
  maxAttempts: z.number().min(1).max(10).default(3),
  delay: z.number().min(0).default(1000),
  maxDelay: z.number().min(0).optional(),
  backoffMultiplier: z.number().min(1).optional(),
  jitter: z.boolean().optional(),
  retryableErrors: z.array(z.string()).optional(),
});

export const NotificationConfigSchema = z.object({
  type: z.enum(['email', 'slack', 'webhook', 'log']),
  target: z.string(),
  template: z.string().optional(),
  condition: z.string().optional(),
});

export const ErrorHandlerSchema = z.object({
  strategy: ErrorStrategySchema,
  retryConfig: RetryConfigSchema.optional(),
  fallbackStage: StageIdSchema.optional(),
  compensationStage: StageIdSchema.optional(),
  onError: z.string().optional(),
  notifications: z.array(NotificationConfigSchema).optional(),
});

// =====================
// Variable Schemas
// =====================

export const VariableDefinitionSchema = z.object({
  name: VariableNameSchema,
  type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'any']),
  defaultValue: z.any().optional(),
  required: z.boolean().optional(),
  description: z.string().optional(),
  validation: z.string().optional(),
  enum: z.array(z.any()).optional(),
  sensitive: z.boolean().optional(),
});

// =====================
// Stage Schemas
// =====================

export const BaseStageSchema = z.object({
  id: StageIdSchema,
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: StageTypeSchema,
  condition: z.string().optional(),
  timeout: z.number().min(0).optional(),
  retryConfig: RetryConfigSchema.optional(),
  errorHandler: ErrorHandlerSchema.optional(),
  metadata: z.record(z.any()).optional(),
  tags: z.array(z.string()).optional(),
});

export const TaskStageSchema = BaseStageSchema.extend({
  type: z.literal(StageType.TASK),
  agent: AgentNameSchema,
  complexity: ComplexityLevelSchema,
  input: z.union([z.record(z.any()), z.string()]),
  output: z.object({
    variable: VariableNameSchema,
    transform: z.string().optional(),
  }).optional(),
  dependencies: z.array(StageIdSchema).optional(),
});

export const SequentialStageSchema: z.ZodType<any> = BaseStageSchema.extend({
  type: z.literal(StageType.SEQUENTIAL),
  stages: z.lazy(() => z.array(PipelineStageSchema)),
});

export const ParallelStageSchema: z.ZodType<any> = BaseStageSchema.extend({
  type: z.literal(StageType.PARALLEL),
  stages: z.lazy(() => z.array(PipelineStageSchema)),
  maxConcurrency: z.number().min(1).optional(),
  waitAll: z.boolean().optional(),
  aggregateOutput: z.string().optional(),
});

export const ConditionalStageSchema: z.ZodType<any> = BaseStageSchema.extend({
  type: z.literal(StageType.CONDITIONAL),
  expression: z.string(),
  thenStage: z.lazy(() => PipelineStageSchema),
  elseStage: z.lazy(() => PipelineStageSchema).optional(),
});

export const LoopStageSchema: z.ZodType<any> = BaseStageSchema.extend({
  type: z.literal(StageType.LOOP),
  iterator: z.object({
    type: z.enum(['for', 'while', 'foreach']),
    variable: VariableNameSchema.optional(),
    collection: z.string().optional(),
    condition: z.string().optional(),
    start: z.number().optional(),
    end: z.number().optional(),
    step: z.number().optional(),
  }),
  body: z.lazy(() => PipelineStageSchema),
  maxIterations: z.number().min(1).max(10000).optional(),
});

export const SubWorkflowStageSchema = BaseStageSchema.extend({
  type: z.literal(StageType.SUBWORKFLOW),
  workflowId: WorkflowIdSchema,
  version: WorkflowVersionSchema.optional(),
  input: z.record(z.any()),
  output: z.object({
    variable: VariableNameSchema,
    mapping: z.record(z.string()).optional(),
  }).optional(),
  async: z.boolean().optional(),
});

export const WaitStageSchema = BaseStageSchema.extend({
  type: z.literal(StageType.WAIT),
  duration: z.number().min(0).optional(),
  until: z.string().optional(),
  event: z.string().optional(),
});

export const TransformStageSchema = BaseStageSchema.extend({
  type: z.literal(StageType.TRANSFORM),
  input: z.union([z.record(z.any()), z.string()]),
  transform: z.string(),
  output: z.object({
    variable: VariableNameSchema,
  }),
});

export const PipelineStageSchema: z.ZodType<any> = z.union([
  TaskStageSchema,
  SequentialStageSchema,
  ParallelStageSchema,
  ConditionalStageSchema,
  LoopStageSchema,
  SubWorkflowStageSchema,
  WaitStageSchema,
  TransformStageSchema,
]);

// =====================
// Hooks and Features
// =====================

export const WorkflowHooksSchema = z.object({
  beforeStart: z.string().optional(),
  afterComplete: z.string().optional(),
  onError: z.string().optional(),
  onCancel: z.string().optional(),
  onTimeout: z.string().optional(),
  beforeStage: z.string().optional(),
  afterStage: z.string().optional(),
});

export const WorkflowFeaturesSchema = z.object({
  checkpointing: z.boolean().optional(),
  debugging: z.boolean().optional(),
  tracing: z.boolean().optional(),
  metrics: z.boolean().optional(),
  parallelism: z.object({
    enabled: z.boolean(),
    maxWorkers: z.number().min(1).optional(),
  }).optional(),
  caching: z.object({
    enabled: z.boolean(),
    ttl: z.number().min(0).optional(),
  }).optional(),
});

// =====================
// Main Workflow Schema
// =====================

export const WorkflowDSLSchema = z.object({
  metadata: WorkflowMetadataSchema,
  triggers: z.array(WorkflowTriggerSchema).optional(),
  variables: z.array(VariableDefinitionSchema),
  context: z.record(z.any()).optional(),
  pipeline: z.array(PipelineStageSchema),
  errorHandling: ErrorHandlerSchema,
  timeouts: TimeoutConfigSchema,
  notifications: z.array(NotificationConfigSchema).optional(),
  hooks: WorkflowHooksSchema.optional(),
  features: WorkflowFeaturesSchema.optional(),
});

// =====================
// Execution Schemas
// =====================

export const StageResultSchema = z.object({
  stageId: StageIdSchema,
  status: z.enum(['success', 'failure', 'skipped', 'timeout']),
  output: z.any().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    stage: StageIdSchema.optional(),
    timestamp: z.date(),
    stack: z.string().optional(),
    recoverable: z.boolean().optional(),
    retryable: z.boolean().optional(),
    context: z.record(z.any()).optional(),
  }).optional(),
  startedAt: z.date(),
  completedAt: z.date(),
  duration: z.number(),
  retries: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

export const WorkflowContextSchema = z.object({
  workflowId: WorkflowIdSchema,
  executionId: z.string(),
  variables: z.map(VariableNameSchema, z.any()),
  results: z.map(StageIdSchema, StageResultSchema),
  metadata: z.record(z.any()),
  startedAt: z.date().optional(),
  checkpoints: z.array(z.object({
    id: z.string(),
    stageId: StageIdSchema,
    timestamp: z.date(),
    state: z.any(),
    resumable: z.boolean(),
  })),
  currentStage: StageIdSchema.optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  errors: z.array(z.object({
    code: z.string(),
    message: z.string(),
    stage: StageIdSchema.optional(),
    timestamp: z.date(),
    stack: z.string().optional(),
    recoverable: z.boolean().optional(),
    retryable: z.boolean().optional(),
    context: z.record(z.any()).optional(),
  })),
});

// =====================
// Validation Schemas
// =====================

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.object({
    code: z.string(),
    message: z.string(),
    path: z.string(),
    severity: z.literal('error'),
    suggestion: z.string().optional(),
  })),
  warnings: z.array(z.object({
    code: z.string(),
    message: z.string(),
    path: z.string(),
    severity: z.literal('warning'),
    suggestion: z.string().optional(),
  })),
  info: z.array(z.object({
    code: z.string(),
    message: z.string(),
    path: z.string(),
    severity: z.literal('info'),
  })),
});

// =====================
// JSON Schema Generation
// =====================

import { zodToJsonSchema } from 'zod-to-json-schema';

export function generateWorkflowJSONSchema() {
  return zodToJsonSchema(WorkflowDSLSchema, {
    name: 'WorkflowDSL',
    $refStrategy: 'root',
  });
}

// =====================
// Validation Helpers
// =====================

export function validateWorkflowDSL(workflow: unknown): ValidationResultType {
  const result = WorkflowDSLSchema.safeParse(workflow);

  if (result.success) {
    return {
      valid: true,
      errors: [],
      warnings: [],
      info: [],
    };
  }

  const errors = result.error.errors.map((error) => ({
    code: 'VALIDATION_ERROR',
    message: error.message,
    path: error.path.join('.'),
    severity: ValidationSeverity.ERROR,
    suggestion: getSuggestionForError(error),
  }));

  return {
    valid: false,
    errors,
    warnings: [],
    info: [],
  };
}

export function validateStage(stage: unknown): ValidationResultType {
  const result = PipelineStageSchema.safeParse(stage);

  if (result.success) {
    return {
      valid: true,
      errors: [],
      warnings: [],
      info: [],
    };
  }

  const errors = result.error.errors.map((error) => ({
    code: 'STAGE_VALIDATION_ERROR',
    message: error.message,
    path: error.path.join('.'),
    severity: ValidationSeverity.ERROR,
    suggestion: getSuggestionForError(error),
  }));

  return {
    valid: false,
    errors,
    warnings: [],
    info: [],
  };
}

function getSuggestionForError(error: any): string | undefined {
  if (error.code === 'invalid_type') {
    return `Expected ${error.expected}, but received ${error.received}`;
  }
  if (error.code === 'invalid_enum_value') {
    return `Valid values are: ${error.options.join(', ')}`;
  }
  if (error.code === 'too_small') {
    return `Minimum value is ${error.minimum}`;
  }
  if (error.code === 'too_big') {
    return `Maximum value is ${error.maximum}`;
  }
  if (error.code === 'invalid_string') {
    if (error.validation === 'regex') {
      return `Must match pattern: ${error.regex}`;
    }
    if (error.validation === 'url') {
      return 'Must be a valid URL';
    }
  }
  return undefined;
}

// =====================
// Type Guards
// =====================

export function isTaskStage(stage: any): stage is z.infer<typeof TaskStageSchema> {
  return stage?.type === StageType.TASK;
}

export function isSequentialStage(stage: any): stage is z.infer<typeof SequentialStageSchema> {
  return stage?.type === StageType.SEQUENTIAL;
}

export function isParallelStage(stage: any): stage is z.infer<typeof ParallelStageSchema> {
  return stage?.type === StageType.PARALLEL;
}

export function isConditionalStage(stage: any): stage is z.infer<typeof ConditionalStageSchema> {
  return stage?.type === StageType.CONDITIONAL;
}

export function isLoopStage(stage: any): stage is z.infer<typeof LoopStageSchema> {
  return stage?.type === StageType.LOOP;
}

export function isSubWorkflowStage(stage: any): stage is z.infer<typeof SubWorkflowStageSchema> {
  return stage?.type === StageType.SUBWORKFLOW;
}

export function isWaitStage(stage: any): stage is z.infer<typeof WaitStageSchema> {
  return stage?.type === StageType.WAIT;
}

export function isTransformStage(stage: any): stage is z.infer<typeof TransformStageSchema> {
  return stage?.type === StageType.TRANSFORM;
}

// Export types
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export type WorkflowDSL = z.infer<typeof WorkflowDSLSchema>;
export type PipelineStage = z.infer<typeof PipelineStageSchema>;