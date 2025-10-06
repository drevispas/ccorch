/**
 * API Validation Schemas
 *
 * WBS Task: 7.2 Zod Validation Schemas
 * PRD Reference: §5.4 (API Interface)
 *
 * Zod schemas for validating API request payloads.
 */

import { z } from 'zod';

/**
 * StatusQuerySchema
 *
 * Validates workflow status query requests.
 * Used for: GET /api/workflows/:id/status
 *
 * PRD §5.4.3: Query workflow state and progress
 */
export const StatusQuerySchema = z.object({
  workflow_id: z.string().uuid('Workflow ID must be a valid UUID'),
});

export type StatusQuery = z.infer<typeof StatusQuerySchema>;

/**
 * TransitionRequestSchema
 *
 * Validates admin transition requests for manual workflow control.
 * Used for: POST /api/workflows/:id/transition
 *
 * PRD §5.4.4: Administrative endpoint for debugging, recovery, testing
 *
 * Actions:
 * - advance: Force next step (current_step++)
 * - fail: Abort workflow (status=FAILED, stop chain)
 * - retry: Re-run current agent (keep current_step, clear last result)
 * - skip: Jump to next without completing current (current_step++, mark SKIPPED)
 */
export const TransitionRequestSchema = z.object({
  action: z.enum(['advance', 'fail', 'retry', 'skip'], {
    errorMap: () => ({
      message: 'Action must be one of: advance, fail, retry, skip',
    }),
  }),
  reason: z
    .string()
    .min(1, 'Reason cannot be empty')
    .describe('Reason for manual transition (logged in workflow_transitions table)'),
});

export type TransitionRequest = z.infer<typeof TransitionRequestSchema>;
