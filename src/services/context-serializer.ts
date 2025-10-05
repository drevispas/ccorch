/**
 * Context Serializer Service
 *
 * Purpose: Extract summaries from agent results and build context strings
 * for passing to next agent in workflow chain.
 *
 * PRD Reference: §6.2 - "Review previous results: {summary}"
 */

import type { AgentResult } from '@prisma/client';

/**
 * Extract summary field from agent result JSON
 *
 * @param agentResult - Agent result containing JSON results
 * @returns Summary string or empty string if not found/invalid
 */
export function extractSummary(agentResult: AgentResult): string {
  // Handle empty results
  if (!agentResult.results || agentResult.results.trim() === '') {
    return '';
  }

  try {
    const parsed = JSON.parse(agentResult.results);

    // Check if summary exists and is a string
    if (parsed.summary && typeof parsed.summary === 'string') {
      return parsed.summary;
    }

    return '';
  } catch (error) {
    // Malformed JSON - return empty string
    return '';
  }
}

/**
 * Build context string from previous agent results
 *
 * Formats agent summaries as numbered list for next agent to review.
 * Format: "Previous agent results:\n1. [agent-role]: summary\n2. [agent-role]: summary"
 *
 * @param previousResults - Array of agent results from workflow
 * @returns Formatted context string or empty string if no valid summaries
 */
export function buildContextForAgent(previousResults: AgentResult[]): string {
  // Handle empty array
  if (!previousResults || previousResults.length === 0) {
    return '';
  }

  // Extract summaries with agent roles
  const summaries: Array<{ role: string; summary: string }> = [];

  for (const result of previousResults) {
    const summary = extractSummary(result);

    // Only include results with valid summaries
    if (summary) {
      summaries.push({
        role: result.agentRole,
        summary,
      });
    }
  }

  // If no valid summaries, return empty string
  if (summaries.length === 0) {
    return '';
  }

  // Build formatted context string
  const contextLines = summaries.map((item, index) => {
    return `${index + 1}. [${item.role}]: ${item.summary}`;
  });

  return `Previous agent results:\n${contextLines.join('\n')}`;
}
