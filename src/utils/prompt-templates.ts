/**
 * Prompt Templates Module
 *
 * Purpose: Generate formatted prompts for agent handoffs in workflow chains.
 * Templates ensure consistent format and include all required elements.
 *
 * PRD Reference: §6.1 (UserPromptSubmit), §6.2 (PostToolUse)
 */

import type { AgentRole, Complexity } from '../types/workflow';

/**
 * Generate first agent prompt (PRD §6.1 format)
 *
 * Format:
 * Use the {agent-role}-{complexity} subagent to:
 * {userPrompt}
 *
 * Workflow ID: {workflowId}
 *
 * @param agentRole - Agent role enum value
 * @param complexity - Complexity level enum value
 * @param workflowId - Workflow identifier
 * @param userPrompt - User's original task description
 * @returns Formatted prompt for first agent
 */
export function generateFirstAgentPrompt(
  agentRole: AgentRole,
  complexity: Complexity,
  workflowId: string,
  userPrompt: string
): string {
  return `Use the ${agentRole}-${complexity} subagent to:
${userPrompt}

Workflow ID: ${workflowId}`;
}

/**
 * Generate next agent prompt with previous context (PRD §6.2 format)
 *
 * Format:
 * Use the {agent-role}-{complexity} subagent to:
 * Review previous results:
 * {previousContext}
 *
 * Continue with: {userPrompt}
 *
 * Workflow ID: {workflowId}
 *
 * @param agentRole - Next agent role
 * @param complexity - Complexity level
 * @param workflowId - Workflow identifier
 * @param userPrompt - User's original task description
 * @param previousContext - Formatted context from previous agents
 * @returns Formatted prompt for next agent with context
 */
export function generateNextAgentPrompt(
  agentRole: AgentRole,
  complexity: Complexity,
  workflowId: string,
  userPrompt: string,
  previousContext: string
): string {
  let prompt = `Use the ${agentRole}-${complexity} subagent to:\n`;

  if (previousContext && previousContext.trim() !== '') {
    prompt += `Review previous results:\n${previousContext}\n\n`;
  }

  prompt += `Continue with: ${userPrompt}\n\nWorkflow ID: ${workflowId}`;

  return prompt;
}

/**
 * Generate workflow completion message
 *
 * Format:
 * Workflow complete. All agents finished successfully.
 * Workflow ID: {workflowId}
 *
 * {workflowSummary}
 *
 * @param workflowId - Workflow identifier
 * @param workflowSummary - Summary of workflow results
 * @returns Formatted completion message
 */
export function generateCompletionMessage(
  workflowId: string,
  workflowSummary: string
): string {
  let message = `Workflow complete. All agents finished successfully.\nWorkflow ID: ${workflowId}`;

  if (workflowSummary && workflowSummary.trim() !== '') {
    message += `\n\n${workflowSummary}`;
  }

  return message;
}
