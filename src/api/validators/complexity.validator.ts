/**
 * Complexity API Validator
 *
 * Purpose: Zod schemas for validating set-complexity API endpoint requests
 * and responses. Ensures type safety and runtime validation.
 */

import { z } from 'zod';

/**
 * Valid complexity levels
 */
export const ComplexityEnum = z.enum(['simple', 'moderate', 'complex']);

/**
 * Request body schema for POST /api/workflows/:workflowId/set-complexity
 */
export const SetComplexityRequestSchema = z.object({
  complexity: ComplexityEnum,
  reasoning: z
    .string()
    .max(200, 'Reasoning must be 200 characters or less')
    .optional(),
});

/**
 * URL parameter schema (workflowId)
 */
export const WorkflowIdParamSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
});

/**
 * Response schema for successful set-complexity operation
 */
export const SetComplexityResponseSchema = z.object({
  success: z.literal(true),
  workflowId: z.string(),
  complexity: ComplexityEnum,
  nextInstructions: z.string(),
});

/**
 * Error response schema
 */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

// TypeScript types derived from Zod schemas
export type SetComplexityRequest = z.infer<typeof SetComplexityRequestSchema>;
export type WorkflowIdParam = z.infer<typeof WorkflowIdParamSchema>;
export type SetComplexityResponse = z.infer<typeof SetComplexityResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
