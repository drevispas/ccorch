/**
 * Stop Hook Handler
 *
 * WBS Task: 6.1 Hook Adapters
 * PRD Reference: §5.1 (Hook Processing)
 *
 * Handles Stop hook events from Claude Code.
 * Cleans up orphaned workflows when sessions terminate.
 */

import { z } from 'zod';
import type { IWorkflowRepository } from '../types/repositories';

/**
 * Stop payload schema (Claude Code hook spec)
 */
const StopPayloadSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string().optional(),
  cwd: z.string(),
  permission_mode: z.string().optional(),
  hook_event_name: z.literal('Stop').optional(),
  stop_hook_active: z.boolean().optional(),
});

export type StopPayload = z.infer<typeof StopPayloadSchema>;

/**
 * Handle Stop hook event
 *
 * Marks active workflow for the specific session as FAILED.
 * This prevents orphaned workflows from lingering in the database.
 *
 * Note: Stop hook does not return messages to Claude Code (PRD §5.1).
 *
 * @param payload - Hook payload from Claude Code
 * @param workflowRepo - Workflow repository instance
 */
export async function handleStop(
  payload: unknown,
  workflowRepo: IWorkflowRepository
): Promise<void> {
  try {
    // 1. Validate payload
    const validationResult = StopPayloadSchema.safeParse(payload);

    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');

      console.error(JSON.stringify({
        event: 'stop_hook_validation_error',
        error: errorMessages,
      }));
      return; // Fail silently per PRD §5.1
    }

    const validatedPayload = validationResult.data;

    // 2. Find active workflow for this session
    const workflow = await workflowRepo.findActiveBySession(validatedPayload.session_id);

    if (!workflow) {
      console.log(JSON.stringify({
        event: 'stop_hook_skipped',
        reason: 'no_active_workflow',
        sessionId: validatedPayload.session_id,
      }));
      return; // No active workflow to clean up
    }

    // 3. Mark workflow as FAILED
    await workflowRepo.updateStatus(workflow.id, 'FAILED');

    console.log(JSON.stringify({
      event: 'stop_hook_processed',
      workflowId: workflow.id,
      sessionId: validatedPayload.session_id,
    }));
  } catch (error) {
    // Log error but don't throw (stop hook should be fault-tolerant)
    console.error('Error in Stop hook handler:', error);
  }
}
