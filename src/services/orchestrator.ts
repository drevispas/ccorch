/**
 * Orchestrator Coordinator Service
 *
 * Purpose: Main coordination logic for workflow orchestration.
 * Handles user prompt processing and agent handoffs.
 *
 * PRD Reference: §6.1 (UserPromptSubmit), §6.2 (PostToolUse)
 */

import { parseIntent } from './prompt-parser';
import { analyzeComplexity } from './complexity-analyzer';
import { resolveChain } from './chain-resolver';
import { buildContextForAgent } from './context-serializer';
import type { StateManager } from './state-manager';
import type { IAgentResultRepository, AgentResultCreateInput } from '../types/repositories';
import { ChainName, AgentRole } from '../types/workflow';

/**
 * Chain agent sequences mapped by chain name
 * (Duplicated from StateManager for orchestrator's needs)
 */
const CHAIN_SEQUENCES: Record<ChainName, AgentRole[]> = {
  [ChainName.BACKEND_DEVELOPMENT]: [
    AgentRole.BACKEND_ARCHITECT,
    AgentRole.BACKEND_DEVELOPER,
    AgentRole.REVIEWER,
  ],
  [ChainName.FRONTEND_DEVELOPMENT]: [
    AgentRole.FRONTEND_ARCHITECT,
    AgentRole.FRONTEND_DEVELOPER,
    AgentRole.REVIEWER,
  ],
  [ChainName.DEBUG]: [
    AgentRole.DEBUGGER,
    AgentRole.BACKEND_DEVELOPER,
    AgentRole.REVIEWER,
  ],
  [ChainName.REVIEW]: [
    AgentRole.REVIEWER,
    AgentRole.BACKEND_DEVELOPER,
  ],
  [ChainName.BACKEND_DESIGN_ONLY]: [AgentRole.BACKEND_ARCHITECT],
  [ChainName.FRONTEND_DESIGN_ONLY]: [AgentRole.FRONTEND_ARCHITECT],
  [ChainName.BACKEND_ONLY]: [AgentRole.BACKEND_DEVELOPER],
  [ChainName.FRONTEND_ONLY]: [AgentRole.FRONTEND_DEVELOPER],
  [ChainName.REVIEW_ONLY]: [AgentRole.REVIEWER],
  [ChainName.DEBUG_ONLY]: [AgentRole.DEBUGGER],
};

/**
 * Response from handleUserPrompt
 */
export interface UserPromptResponse {
  workflowId: string;
  prompt: string;
  agentRole: AgentRole;
  complexity: string;
}

/**
 * Response from handleAgentComplete
 */
export interface AgentCompleteResponse {
  workflowId: string;
  status: 'continue' | 'completed' | 'failed';
  prompt?: string;
  agentRole?: AgentRole;
  complexity?: string;
  previousContext?: string;
  message?: string;
}

/**
 * Orchestrator Coordinator
 *
 * Coordinates workflow lifecycle and agent handoffs
 */
export class Orchestrator {
  constructor(
    private readonly stateManager: StateManager,
    private readonly agentResultRepo: IAgentResultRepository
  ) {}

  /**
   * Handle user prompt and initiate workflow
   *
   * Processes user input, determines workflow chain, creates workflow,
   * and returns first agent prompt.
   *
   * @param userPrompt - User's task description
   * @param sessionId - Claude Code session ID for correlation
   * @returns First agent prompt and workflow ID
   */
  async handleUserPrompt(userPrompt: string, sessionId?: string): Promise<UserPromptResponse> {
    // Validate prompt
    if (!userPrompt || userPrompt.trim() === '') {
      throw new Error('User prompt cannot be empty');
    }

    // 1. Parse intent from user prompt
    const intent = parseIntent(userPrompt);

    // Validate intent has content
    if (intent.roles.length === 0 && intent.keywords.length === 0) {
      throw new Error('Could not parse intent from user prompt');
    }

    // 2. Analyze complexity
    const complexity = analyzeComplexity(userPrompt, intent);

    // 3. Resolve workflow chain
    const { chainName, agentSequence } = resolveChain(intent, userPrompt);

    // 4. Create workflow
    const workflow = await this.stateManager.createWorkflow({
      sessionId,
      userPrompt,
      chainName,
      complexity,
    });

    // 5. Get first agent from sequence
    const firstAgent = agentSequence[0];

    // 6. Generate first agent prompt (PRD §6.1 format)
    const prompt = this.generateFirstAgentPrompt(firstAgent, complexity, chainName);

    // 7. Log workflow creation decision
    console.log(JSON.stringify({
      event: 'workflow_created',
      workflowId: workflow.id,
      chainName,
      complexity,
      firstAgent,
      agentSequence,
    }));

    return {
      workflowId: workflow.id,
      prompt,
      agentRole: firstAgent,
      complexity,
    };
  }

  /**
   * Handle agent completion and determine next step
   *
   * Stores agent results, advances workflow, and returns either:
   * - Next agent prompt (if workflow continues)
   * - Completion message (if workflow done)
   * - Failure message (if agent failed)
   *
   * @param workflowId - Workflow identifier
   * @param agentResults - Completed agent's results
   * @returns Next step instructions or completion/failure message
   */
  async handleAgentComplete(
    workflowId: string,
    agentResults: AgentResultCreateInput
  ): Promise<AgentCompleteResponse> {
    // 1. Get current workflow state
    const workflow = await this.stateManager.getWorkflow(workflowId);

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // 2. Store agent results
    await this.agentResultRepo.createResult(agentResults);

    // 3. Check if agent failed
    if (agentResults.status === 'FAILED') {
      await this.stateManager.failWorkflow(
        workflowId,
        `Agent failed: ${agentResults.agentRole} at step ${agentResults.stepNumber}`
      );

      console.log(JSON.stringify({
        event: 'workflow_failed',
        workflowId,
        failedAgent: agentResults.agentRole,
        stepNumber: agentResults.stepNumber,
      }));

      return {
        workflowId,
        status: 'failed',
        message: 'Workflow failed due to agent error. Check agent results for details.',
      };
    }

    // 4. Advance workflow step
    const updatedWorkflow = await this.stateManager.advanceStep(
      workflowId,
      agentResults.agentRole as AgentRole
    );

    // 5. Check if workflow completed
    if (updatedWorkflow.status === 'COMPLETED') {
      console.log(JSON.stringify({
        event: 'workflow_completed',
        workflowId,
        lastAgent: agentResults.agentRole,
      }));

      return {
        workflowId,
        status: 'completed',
        message: 'Workflow complete. All agents finished successfully.',
      };
    }

    // 6. Workflow continues - get previous results for context
    const previousResults = await this.agentResultRepo.findByWorkflowId(workflowId);
    const previousContext = buildContextForAgent(previousResults);

    // 7. Determine next agent
    const agentSequence = this.getAgentSequence(workflow.chainName as ChainName);
    const nextAgent = agentSequence[updatedWorkflow.currentStep];

    // 8. Generate next agent prompt (PRD §6.2 format)
    const prompt = this.generateNextAgentPrompt(
      nextAgent,
      workflow.complexity,
      workflow.chainName as ChainName,
      updatedWorkflow.currentStep,
      previousContext
    );

    // 9. Log agent transition
    console.log(JSON.stringify({
      event: 'agent_transition',
      workflowId,
      fromAgent: agentResults.agentRole,
      toAgent: nextAgent,
      step: updatedWorkflow.currentStep,
    }));

    return {
      workflowId,
      status: 'continue',
      prompt,
      agentRole: nextAgent,
      complexity: workflow.complexity,
      previousContext,
    };
  }

  /**
   * Generate first agent prompt (PRD §6.1 format)
   *
   * Creates actionable Task tool invocation prompts for first agent in chain
   *
   * @param agentRole - Agent role
   * @param complexity - Complexity level
   * @param chainName - Workflow chain name
   * @returns Formatted prompt for first agent
   */
  private generateFirstAgentPrompt(
    agentRole: AgentRole,
    complexity: string,
    chainName: string
  ): string {
    const agentName = `${agentRole}-${complexity}`;
    return `IMPORTANT: You must invoke the Task tool with subagent_type="${agentName}" to handle this ${chainName} task.`;
  }

  /**
   * Generate next agent prompt with context (PRD §6.2 format)
   *
   * Creates actionable Task tool invocation prompts with context from previous agents
   *
   * @param agentRole - Next agent role
   * @param complexity - Complexity level
   * @param chainName - Workflow chain name
   * @param stepNumber - Current step in workflow (1-indexed)
   * @param previousContext - Context from previous agents
   * @returns Formatted prompt for next agent
   */
  private generateNextAgentPrompt(
    agentRole: AgentRole,
    complexity: string,
    chainName: ChainName,
    stepNumber: number,
    previousContext?: string
  ): string {
    const agentName = `${agentRole}-${complexity}`;
    let prompt = `IMPORTANT: You must invoke the Task tool with subagent_type="${agentName}" to handle this ${chainName} task.`;

    if (previousContext) {
      prompt += `\n\n${previousContext}`;
    }

    return prompt;
  }

  /**
   * Get agent sequence for a given chain
   *
   * @param chainName - Chain name
   * @returns Array of agent roles in sequence
   */
  private getAgentSequence(chainName: ChainName): AgentRole[] {
    const sequence = CHAIN_SEQUENCES[chainName];

    if (!sequence) {
      throw new Error(`Unknown chain name: ${chainName}`);
    }

    return sequence;
  }
}
