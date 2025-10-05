/**
 * Prompt Generator Service
 *
 * Purpose: Generate prompts for Claude Code at different stages of the workflow:
 * 1. Complexity analysis prompts (asking CC to determine final complexity)
 * 2. Agent injection prompts (instructing CC to use specific subagents)
 *
 * This service provides reusable, templated prompts to maintain consistency
 * across UserPromptSubmit hook and set-complexity API endpoint responses.
 */

import { Complexity } from '../types/repositories.js';

/**
 * Chain definition for generating agent prompts
 */
export interface ChainDefinition {
  chainName: string;
  agentRole: string;
  complexity: Complexity;
  stepNumber: number;
}

/**
 * Generate prompt asking Claude Code to analyze task complexity
 *
 * @param userPrompt - Original user request
 * @param draftComplexity - Initial complexity estimate from keyword analysis
 * @param workflowId - Workflow ID for API callback
 * @param apiBaseUrl - Base URL for CCOrch API (e.g., http://localhost:3000)
 * @returns Formatted prompt for Claude Code
 */
export function generateComplexityAnalysisPrompt(
  userPrompt: string,
  draftComplexity: Complexity,
  workflowId: string,
  apiBaseUrl: string,
): string {
  return `Analyze the following task and determine its complexity level:

**Task**: "${userPrompt}"

**Complexity Guidelines**:
- **simple**: Single file/function modification, quick fixes, renames (1-2 files max, <50 lines)
- **moderate**: Standard feature implementation, 2-5 files, backward-compatible changes
- **complex**: System-wide refactoring, multi-module changes, architecture design, breaking changes

**Draft Complexity** (from keyword analysis): **${draftComplexity}**

**Instructions**:
1. Analyze the task scope (files affected, dependencies, risk level)
2. Determine the final complexity level (simple, moderate, or complex)
3. Provide brief reasoning (1-2 sentences)
4. Call the CCOrch API to submit your determination:

   **API Endpoint**: POST ${apiBaseUrl}/api/workflows/${workflowId}/set-complexity

   **Request Body**:
   \`\`\`json
   {
     "complexity": "your-determination",
     "reasoning": "brief explanation"
   }
   \`\`\`

5. **IMPORTANT**: Read the API response and execute the instructions in the \`nextInstructions\` field

The API will respond with the next steps for the workflow.`;
}

/**
 * Generate prompt instructing Claude Code to use a specific subagent
 *
 * @param chain - Chain definition (agent role, complexity, step)
 * @param context - Optional context from previous agent results
 * @param workflowId - Workflow ID for tracking (optional, used in agent task description)
 * @returns Formatted agent injection prompt
 */
export function generateAgentPrompt(
  chain: ChainDefinition,
  context?: string,
  workflowId?: string,
): string {
  const agentName = `${chain.agentRole}-${chain.complexity}`;
  const taskPrefix = context
    ? `Review the previous agent's results and continue the workflow.`
    : `Begin the workflow for this task.`;

  // Build task list based on agent role
  const tasks: string[] = [];

  if (context) {
    tasks.push(`Review previous agent results: ${context}`);
  }

  // Role-specific tasks
  switch (chain.agentRole) {
    case 'backend-architect':
    case 'frontend-architect':
      tasks.push(
        'Design the architecture and technical approach (design only, do not implement)',
      );
      tasks.push('Document key design decisions and component interactions');
      break;

    case 'backend-developer':
      tasks.push('Implement the backend functionality according to design');
      tasks.push('Write unit tests for new code');
      tasks.push('Ensure proper error handling and logging');
      break;

    case 'frontend-developer':
      tasks.push('Implement the frontend components and UI');
      tasks.push('Ensure responsive design and accessibility');
      tasks.push('Write component tests');
      break;

    case 'reviewer':
      tasks.push('Review all staged and unstaged changes');
      tasks.push('Check code quality, security, and test coverage');
      tasks.push('Provide actionable recommendations for improvement');
      break;

    case 'debugger':
      tasks.push('Investigate the issue and identify root cause');
      tasks.push('Document findings and propose solution approach');
      break;

    default:
      tasks.push('Complete the assigned task');
  }

  // Format tasks as numbered list
  const taskList = tasks.map((task, index) => `${index + 1}. ${task}`).join('\n');

  return `Use the **${agentName}** subagent to complete the following tasks:

${taskPrefix}

**Tasks**:
${taskList}

Execute these tasks and provide results when complete.`;
}

/**
 * Generate completion message for workflow
 *
 * @param chainName - Name of the completed workflow chain
 * @param agentSummaries - Array of summary strings from each completed agent
 * @returns Formatted completion message
 */
export function generateCompletionMessage(
  chainName: string,
  agentSummaries: string[],
): string {
  const summaryList = agentSummaries
    .map((summary, index) => `${index + 1}. ${summary}`)
    .join('\n');

  return `**Workflow Complete**: ${chainName}

All agents have finished successfully.

**Summary**:
${summaryList}

The workflow has been completed. Review the results above.`;
}
