import { z } from 'zod';

// Common schemas used across multiple endpoints

export const CorrelationIdSchema = z.string().regex(
  /^req_\d+$/,
  'Invalid correlation ID format'
);

export const WorkflowIdSchema = z.string().regex(
  /^wf_\d+_[a-z0-9]+$/,
  'Invalid workflow ID format'
);

export const TaskIdSchema = z.string().regex(
  /^task_\d+_[a-z0-9]+$/,
  'Invalid task ID format'
);

export const TimestampSchema = z.string().datetime();

export const ComplexityLevelSchema = z.enum(['simple', 'moderate', 'complex']);

export const WorkflowStatusSchema = z.enum([
  'starting',
  'running',
  'completed',
  'failed',
  'paused',
  'cancelled'
]);

export const TaskStatusSchema = z.enum([
  'pending',
  'awaiting_claude_execution',
  'claude_executing',
  'completed',
  'failed',
  'timeout'
]);

export const TodoStatusSchema = z.enum(['pending', 'in_progress', 'completed']);

export const TodoSchema = z.object({
  content: z.string().min(1, 'Todo content cannot be empty'),
  status: TodoStatusSchema,
  activeForm: z.string().optional()
});

export const AgentTypeSchema = z.enum([
  'backend-architect',
  'java-backend-developer',
  'nextjs-react-developer',
  'code-reviewer',
  'e2e-test-architect',
  'issue-detective',
  'backend-architect-simple',
  'backend-architect-moderate',
  'backend-architect-complex',
  'java-backend-developer-simple',
  'java-backend-developer-moderate',
  'java-backend-developer-complex',
  'nextjs-react-developer-simple',
  'nextjs-react-developer-moderate',
  'nextjs-react-developer-complex',
  'code-reviewer-simple',
  'code-reviewer-moderate',
  'code-reviewer-complex',
  'e2e-test-architect-simple',
  'e2e-test-architect-moderate',
  'e2e-test-architect-complex',
  'issue-detective-simple',
  'issue-detective-moderate',
  'issue-detective-complex'
]);

export const WorkflowTypeSchema = z.enum([
  'feature-development',
  'bug-fix',
  'code-review',
  'testing',
  'refactoring',
  'documentation',
  'performance-optimization'
]);

export const ErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
  timestamp: TimestampSchema.optional()
});

export const SuccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  timestamp: TimestampSchema.optional()
});

// Type exports for TypeScript usage
export type CorrelationId = z.infer<typeof CorrelationIdSchema>;
export type WorkflowId = z.infer<typeof WorkflowIdSchema>;
export type TaskId = z.infer<typeof TaskIdSchema>;
export type ComplexityLevel = z.infer<typeof ComplexityLevelSchema>;
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TodoStatus = z.infer<typeof TodoStatusSchema>;
export type Todo = z.infer<typeof TodoSchema>;
export type AgentType = z.infer<typeof AgentTypeSchema>;
export type WorkflowType = z.infer<typeof WorkflowTypeSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;