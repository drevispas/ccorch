/**
 * UserPromptSubmit Hook Handler
 *
 * WBS Task: 6.1 Hook Adapters
 * PRD Reference: §5.1 (Hook Processing), §6.1 (Response Format)
 *
 * Handles UserPromptSubmit hook events from Claude Code.
 * Intercepts user prompts and returns agent injection responses.
 */

import { z } from 'zod';
import type { Orchestrator } from '../services/orchestrator';

/**
 * UserPromptSubmit payload schema (Claude Code hook spec)
 */
const UserPromptSubmitPayloadSchema = z.object({
  session_id: z.string(),
  transcript_path: z.string().optional(), // Optional: discovered in real payloads
  cwd: z.string(),
  permission_mode: z.string().optional(), // Optional: discovered in real payloads
  hook_event_name: z.literal('UserPromptSubmit').optional(), // Optional: discovered in real payloads
  prompt: z.string().min(1, 'Prompt cannot be empty'),
});

export type UserPromptSubmitPayload = z.infer<typeof UserPromptSubmitPayloadSchema>;

/**
 * Trigger patterns for orchestration opt-in
 * Supports: \cco, \c2o (case insensitive, requires whitespace after)
 */
const TRIGGER_PATTERNS = [
  /^\\(cco|c2o)\s+/i, // Case insensitive, requires space after trigger
];

/**
 * Extract orchestration trigger from user prompt
 *
 * @param prompt - Raw user prompt
 * @returns Clean prompt without trigger, or null if no trigger found
 */
function extractTriggerFromPrompt(prompt: string): string | null {
  const trimmed = prompt.trim();

  for (const pattern of TRIGGER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, '').trim();
    }
  }

  return null; // No trigger found
}

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
 * Internal handler response (includes workflowId for logging)
 */
export interface HandlerResponse {
  hookResponse: HookResponse;
  workflowId?: string;
}

/**
 * Handle UserPromptSubmit hook event
 *
 * Processes user prompt and returns agent injection response.
 *
 * @param payload - Hook payload from Claude Code
 * @param orchestrator - Orchestrator service instance
 * @returns Handler response with hook response and workflowId for logging
 */
export async function handleUserPromptSubmit(
  payload: unknown,
  orchestrator: Orchestrator
): Promise<HandlerResponse> {
  try {
    // 1. Validate payload
    const validationResult = UserPromptSubmitPayloadSchema.safeParse(payload);

    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');

      return {
        hookResponse: {
          message: `Error: Invalid hook payload - ${errorMessages}`,
        },
      };
    }

    const validatedPayload = validationResult.data;

    // 2. Check for orchestration trigger (\cco or \c2o)
    const cleanPrompt = extractTriggerFromPrompt(validatedPayload.prompt);

    if (!cleanPrompt) {
      // No trigger found → skip orchestration, return empty response
      console.log(JSON.stringify({
        event: 'orchestration_skipped',
        sessionId: validatedPayload.session_id,
        reason: 'no_trigger',
        prompt: validatedPayload.prompt.substring(0, 100), // Log first 100 chars for debugging
      }));

      return {
        hookResponse: {
          continue: true,
          // No additionalContext = no agent injection
        },
      };
    }

    // 3. Call orchestrator to process user prompt (with cleaned prompt and sessionId)
    const result = await orchestrator.handleUserPrompt(cleanPrompt, validatedPayload.session_id);

    // 4. Format response per Claude Code hooks spec (complete structure)
    // Include all required fields per hooks documentation
    const hookResponse: HookResponse = {
      continue: true, // Allow the prompt to proceed
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: result.prompt,
      },
    };

    // E2E testing: Log workflow ID and the ACTUAL response object being returned
    console.log(JSON.stringify({
      event: 'user_prompt_submit_response',
      workflowId: result.workflowId,
      sessionId: validatedPayload.session_id,
      messageLength: result.prompt.length,
      message: result.prompt,
      actualResponse: hookResponse, // Log the actual response being returned
    }));

    return {
      hookResponse,
      workflowId: result.workflowId,
    };
  } catch (error) {
    // 5. Handle orchestrator errors with fallback message
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    return {
      hookResponse: {
        message: `Error: Failed to process user prompt - ${errorMessage}`,
      },
    };
  }
}
