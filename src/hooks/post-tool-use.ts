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
import type { IWorkflowRepository, AgentResultCreateInput, Complexity } from '../types/repositories';
import { AgentRole } from '../types/workflow';

/**
 * PostToolUse payload schema (Claude Code hook spec)
 * Real payloads from Claude Code only include these fields
 */
const PostToolUsePayloadSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string().optional(),
  cwd: z.string(),
  permission_mode: z.string().optional(),
  hook_event_name: z.literal('PostToolUse').optional(),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()).optional(),
  tool_response: z.object({
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    interrupted: z.boolean().optional(),
    isImage: z.boolean().optional(),
  }).optional(),
});

export type PostToolUsePayload = z.infer<typeof PostToolUsePayloadSchema>;

/**
 * Hook response format (Claude Code hook spec)
 */
export interface HookResponse {
  message?: string;
  decision?: 'allow' | 'block';
  continue?: boolean;
  hookSpecificOutput?: {
    hookEventName?: string;
    additionalContext?: string;
  };
}

/**
 * Handle PostToolUse hook event
 *
 * Filters by tool_name and session correlation, then advances workflow.
 *
 * @param payload - Hook payload from Claude Code
 * @param orchestrator - Orchestrator service instance
 * @param workflowRepo - Workflow repository for session lookup
 * @returns Hook response with next agent prompt or completion message
 */
export async function handlePostToolUse(
  payload: unknown,
  orchestrator: Orchestrator,
  workflowRepo: IWorkflowRepository
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

    // 2. Filter Level 1: Only process Task tool
    if (validatedPayload.tool_name !== 'Task') {
      console.log(JSON.stringify({
        event: 'post_tool_use_skipped',
        reason: 'not_task_tool',
        toolName: validatedPayload.tool_name,
        sessionId: validatedPayload.session_id,
      }));

      return {
        continue: true,
        // No message injection - this is not an orchestrated task
      };
    }

    // 3. Filter Level 2: Find active workflow for this session
    const workflow = await workflowRepo.findActiveBySession(validatedPayload.session_id);

    if (!workflow) {
      console.log(JSON.stringify({
        event: 'post_tool_use_skipped',
        reason: 'no_active_workflow',
        sessionId: validatedPayload.session_id,
      }));

      return {
        continue: true,
        // No active workflow - this Task is not CCOrch-managed
      };
    }

    // 4. Extract agent role from subagent_type parameter
    // Example: "java-backend-developer-moderate" -> "java-backend-developer"
    const subagentType = validatedPayload.tool_input?.subagent_type as string | undefined;

    if (!subagentType) {
      console.log(JSON.stringify({
        event: 'post_tool_use_error',
        reason: 'missing_subagent_type',
        sessionId: validatedPayload.session_id,
        workflowId: workflow.id,
      }));

      return {
        message: 'Error: Task tool invocation missing subagent_type parameter',
      };
    }

    // Extract agent role by removing complexity suffix
    const agentRole = subagentType.replace(/-(simple|moderate|complex)$/, '') as AgentRole;

    // 5. Parse agent results from Task tool output
    // For MVP: Use entire stdout as results (no special parsing)
    const agentOutput = validatedPayload.tool_response?.stdout || '';

    // Build agent results for orchestrator
    const agentResults: AgentResultCreateInput = {
      workflowId: workflow.id,
      agentRole,
      complexity: workflow.complexity as Complexity,
      stepNumber: workflow.currentStep,
      status: 'COMPLETED',
      results: agentOutput,
    };

    console.log(JSON.stringify({
      event: 'post_tool_use_processing',
      workflowId: workflow.id,
      sessionId: validatedPayload.session_id,
      agentRole,
      subagentType,
      currentStep: workflow.currentStep,
      outputLength: agentOutput.length,
    }));

    // 6. Call orchestrator to process agent completion
    const result = await orchestrator.handleAgentComplete(workflow.id, agentResults);

    // 7. Format response based on workflow status
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
      // Workflow continues - inject next agent prompt
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: result.prompt,
        },
      };
    }

    // Fallback (should never reach here)
    return {
      message: 'Error: Unknown workflow status',
    };
  } catch (error) {
    // 8. Handle orchestrator errors with fallback message
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    console.error('Error in PostToolUse handler:', error);

    return {
      message: `Error: Failed to process agent completion - ${errorMessage}`,
    };
  }
}
