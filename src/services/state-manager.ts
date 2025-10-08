/**
 * Workflow State Manager Service
 *
 * Purpose: Manage workflow lifecycle including creation, step advancement,
 * completion, and failure. Ensures idempotency and maintains audit trail.
 *
 * PRD Reference: §5.2 Step 4 - Workflow State Management
 */

import { randomUUID } from 'crypto';
import type { Workflow } from '@prisma/client';
import type {
  IWorkflowRepository,
  ITransitionRepository,
  WorkflowCreateInput,
  WorkflowFindByIdOptions,
  WorkflowWithRelations,
  WorkflowStatus,
  Complexity,
} from '../types/repositories';
import { ChainName, AgentRole } from '../types/workflow';

/**
 * Input for creating a workflow
 */
export interface CreateWorkflowInput {
  sessionId?: string;
  userPrompt: string;
  chainName: ChainName;
  complexity: Complexity;
  status?: WorkflowStatus;
}

/**
 * Chain agent sequences mapped by chain name
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
    AgentRole.BACKEND_DEVELOPER, // Will be determined based on domain
    AgentRole.REVIEWER,
  ],
  [ChainName.REVIEW]: [
    AgentRole.REVIEWER,
    AgentRole.BACKEND_DEVELOPER, // Will be determined based on domain
  ],
  [ChainName.BACKEND_DESIGN_ONLY]: [AgentRole.BACKEND_ARCHITECT],
  [ChainName.FRONTEND_DESIGN_ONLY]: [AgentRole.FRONTEND_ARCHITECT],
  [ChainName.BACKEND_ONLY]: [AgentRole.BACKEND_DEVELOPER],
  [ChainName.FRONTEND_ONLY]: [AgentRole.FRONTEND_DEVELOPER],
  [ChainName.REVIEW_ONLY]: [AgentRole.REVIEWER],
  [ChainName.DEBUG_ONLY]: [AgentRole.DEBUGGER],
};

/**
 * State Manager for workflow lifecycle management
 */
export class StateManager {
  constructor(
    private readonly workflowRepo: IWorkflowRepository,
    private readonly transitionRepo: ITransitionRepository
  ) {}

  /**
   * Create a new workflow with UUID and initial transition
   *
   * @param input - Workflow creation data
   * @returns Created workflow with generated UUID
   */
  async createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
    // Create workflow with UUID
    const workflowData: WorkflowCreateInput = {
      sessionId: input.sessionId,
      userPrompt: input.userPrompt,
      chainName: input.chainName,
      complexity: input.complexity,
      currentStep: 0,
      status: input.status ?? 'ACTIVE',
    };

    const workflow = await this.workflowRepo.createWorkflow(workflowData);

    // Create initial transition (step -1 → 0)
    const agentSequence = this.getAgentSequence(input.chainName);
    const firstAgent = agentSequence[0];

    await this.transitionRepo.createTransition({
      workflowId: workflow.id,
      fromStep: -1,
      toStep: 0,
      fromAgent: null,
      toAgent: firstAgent,
      reason: 'Workflow initialized',
    });

    return workflow;
  }

  /**
   * Advance workflow to next step
   *
   * Implements idempotency: if workflow.currentStep > expected step, this is a no-op.
   * Completes workflow if advancing beyond chain length.
   *
   * @param workflowId - Workflow ID
   * @param completedAgent - Agent role that just completed
   * @returns Updated workflow
   */
  async advanceStep(workflowId: string, completedAgent: AgentRole): Promise<Workflow> {
    // Get current workflow state
    const workflow = await this.workflowRepo.findById(workflowId);

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (workflow.status !== 'ACTIVE') {
      throw new Error(`Cannot advance workflow ${workflowId}: status is ${workflow.status}`);
    }

    const currentStep = workflow.currentStep;
    const agentSequence = this.getAgentSequence(workflow.chainName as ChainName);

    // Find which step the completed agent is at
    const completedAgentStep = agentSequence.indexOf(completedAgent);

    // Idempotency check: if workflow has already advanced past the completed agent's step
    // This handles the case where advanceStep is called multiple times for the same agent
    if (workflow.currentStep > completedAgentStep) {
      return workflow;
    }

    const nextStep = currentStep + 1;

    // Check if workflow should be completed (at last step or beyond)
    if (nextStep >= agentSequence.length) {
      return this.completeWorkflow(
        workflowId,
        'All agents in chain completed successfully'
      );
    }

    // Advance to next step
    const updatedWorkflow = await this.workflowRepo.updateCurrentStep(workflowId, nextStep);

    // Record transition
    const nextAgent = agentSequence[nextStep];
    await this.transitionRepo.createTransition({
      workflowId,
      fromStep: currentStep,
      toStep: nextStep,
      fromAgent: completedAgent,
      toAgent: nextAgent,
      reason: `Advanced from ${completedAgent} to ${nextAgent}`,
    });

    return updatedWorkflow;
  }

  /**
   * Complete workflow
   *
   * Sets status to COMPLETED and records final transition.
   *
   * @param workflowId - Workflow ID
   * @param reason - Completion reason
   * @returns Completed workflow
   */
  async completeWorkflow(workflowId: string, reason: string): Promise<Workflow> {
    // Get current workflow state
    const workflow = await this.workflowRepo.findById(workflowId);

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (workflow.status === 'COMPLETED') {
      return workflow; // Idempotent
    }

    if (workflow.status !== 'ACTIVE') {
      throw new Error(`Cannot complete workflow ${workflowId}: status is ${workflow.status}`);
    }

    const currentStep = workflow.currentStep;
    const agentSequence = this.getAgentSequence(workflow.chainName as ChainName);
    const lastAgent = agentSequence[Math.min(currentStep, agentSequence.length - 1)];

    // Update workflow status to COMPLETED
    const completedWorkflow = await this.workflowRepo.updateStatus(
      workflowId,
      'COMPLETED',
      currentStep
    );

    // Record completion transition
    await this.transitionRepo.createTransition({
      workflowId,
      fromStep: currentStep,
      toStep: currentStep + 1,
      fromAgent: lastAgent,
      toAgent: null,
      reason,
    });

    return completedWorkflow;
  }

  /**
   * Fail workflow
   *
   * Sets status to FAILED and records failure transition.
   *
   * @param workflowId - Workflow ID
   * @param reason - Failure reason
   * @returns Failed workflow
   */
  async failWorkflow(workflowId: string, reason: string): Promise<Workflow> {
    // Get current workflow state
    const workflow = await this.workflowRepo.findById(workflowId);

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    if (workflow.status === 'FAILED') {
      return workflow; // Idempotent
    }

    if (workflow.status !== 'ACTIVE') {
      throw new Error(`Cannot fail workflow ${workflowId}: status is ${workflow.status}`);
    }

    const currentStep = workflow.currentStep;
    const agentSequence = this.getAgentSequence(workflow.chainName as ChainName);
    const currentAgent = agentSequence[Math.min(currentStep, agentSequence.length - 1)];

    // Update workflow status to FAILED
    const failedWorkflow = await this.workflowRepo.updateStatus(
      workflowId,
      'FAILED',
      currentStep
    );

    // Record failure transition
    await this.transitionRepo.createTransition({
      workflowId,
      fromStep: currentStep,
      toStep: currentStep,
      fromAgent: currentAgent,
      toAgent: null,
      reason: `Workflow failed: ${reason}`,
    });

    return failedWorkflow;
  }

  /**
   * Get workflow state by ID
   *
   * @param workflowId - Workflow ID
   * @param options - Optional relations to include
   * @returns Workflow or null if not found
   */
  async getWorkflow(
    workflowId: string,
    options?: WorkflowFindByIdOptions
  ): Promise<WorkflowWithRelations | null> {
    return this.workflowRepo.findById(workflowId, options);
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
