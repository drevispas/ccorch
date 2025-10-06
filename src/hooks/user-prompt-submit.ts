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
  transcript_path: z.string(),
  cwd: z.string(),
  hook_event_name: z.literal('UserPromptSubmit'),
  prompt: z.string().min(1, 'Prompt cannot be empty'),
});

export type UserPromptSubmitPayload = z.infer<typeof UserPromptSubmitPayloadSchema>;

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
 * Handle UserPromptSubmit hook event
 *
 * Processes user prompt and returns agent injection response.
 *
 * @param payload - Hook payload from Claude Code
 * @param orchestrator - Orchestrator service instance
 * @returns Hook response with agent injection message
 */
export async function handleUserPromptSubmit(
  payload: unknown,
  orchestrator: Orchestrator
): Promise<HookResponse> {
  try {
    // 1. Validate payload
    const validationResult = UserPromptSubmitPayloadSchema.safeParse(payload);

    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');

      return {
        message: `Error: Invalid hook payload - ${errorMessages}`,
      };
    }

    const validatedPayload = validationResult.data;

    // 2. Call orchestrator to process user prompt
    const result = await orchestrator.handleUserPrompt(validatedPayload.prompt);

    // 3. Format response per PRD §6.1
    // Format: "Use the {agent-role}-{complexity} subagent to:\n{userPrompt}"
    // Note: No API submission reminder (handled by PostToolUse hook)
    return {
      message: result.prompt,
    };
  } catch (error) {
    // 4. Handle orchestrator errors with fallback message
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    return {
      message: `Error: Failed to process user prompt - ${errorMessage}`,
    };
  }
}
