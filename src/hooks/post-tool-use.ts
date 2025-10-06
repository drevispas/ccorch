/**
 * PostToolUse Hook Handler
 *
 * WBS Task: 6.1 Hook Adapters
 * PRD Reference: §5.1 (Hook Processing), §6.2 (Response Format)
 *
 * Handles PostToolUse hook events from Claude Code.
 * Extracts agent results from payload and returns next agent prompts or completion messages.
 */

import { z } from 'zod';
import type { Orchestrator } from '../services/orchestrator';
import { AgentRole, AgentRoleSchema, ComplexitySchema } from '../types/workflow';

/**
 * PostToolUse payload schema (Claude Code hook spec + CCOrch extensions)
 */
const PostToolUsePayloadSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string(),
  cwd: z.string(),
  hook_event_name: z.literal('PostToolUse'),
  tool_name: z.string(),
  workflow_id: z.string().min(1, 'Workflow ID cannot be empty'),
  agent_role: AgentRoleSchema,
  complexity: ComplexitySchema,
  step_number: z.number().int().nonnegative(),
  results: z.record(z.string(), z.unknown()),
});

export type PostToolUsePayload = z.infer<typeof PostToolUsePayloadSchema>;

/**
 * Hook response format (Claude Code hook spec)
 */
export interface HookResponse {
  message?: string;
  decision?: 'allow' | 'block';
  hookSpecificOutput?: {
    additionalContext?: string;
  };
}

/**
 * Handle PostToolUse hook event
 *
 * Extracts agent results from payload and orchestrates next workflow step.
 *
 * @param payload - Hook payload from Claude Code
 * @param orchestrator - Orchestrator service instance
 * @returns Hook response with next agent prompt or completion message
 */
export async function handlePostToolUse(
  payload: unknown,
  orchestrator: Orchestrator
): Promise<HookResponse> {
  try {
    // 1. Validate payload
    const validationResult = PostToolUsePayloadSchema.safeParse(payload);

    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');

      return {
        message: `Error: Invalid hook payload - ${errorMessages}`,
      };
    }

    const validatedPayload = validationResult.data;

    // 2. Extract agent results from payload
    const agentResults = {
      workflowId: validatedPayload.workflow_id,
      agentRole: validatedPayload.agent_role,
      complexity: validatedPayload.complexity,
      stepNumber: validatedPayload.step_number,
      status: 'COMPLETED' as const,
      results: JSON.stringify(validatedPayload.results), // Convert to JSON string
    };

    // 3. Call orchestrator to process agent completion
    const result = await orchestrator.handleAgentComplete(
      validatedPayload.workflow_id,
      agentResults
    );

    // 4. Format response based on workflow status
    if (result.status === 'completed') {
      // Workflow complete - return completion message
      return {
        message: result.message || 'Workflow complete. All agents finished successfully.',
      };
    } else if (result.status === 'failed') {
      // Workflow failed - return error message
      return {
        message: result.message || 'Workflow failed due to agent error.',
      };
    } else if (result.status === 'continue') {
      // Workflow continues - return next agent prompt (PRD §6.2 format)
      return {
        message: result.prompt,
      };
    }

    // Fallback (should never reach here)
    return {
      message: 'Error: Unknown workflow status',
    };
  } catch (error) {
    // 5. Handle orchestrator errors with fallback message
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    return {
      message: `Error: Failed to process agent completion - ${errorMessage}`,
    };
  }
}
