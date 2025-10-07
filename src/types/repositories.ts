/**
 * Repository Interfaces
 *
 * Purpose: Define contracts for data access layer to enable future migration
 * from SQLite to Redis or other data stores without changing service layer code.
 *
 * These interfaces provide abstraction between business logic and persistence,
 * supporting the repository pattern for testability and maintainability.
 */

import { Workflow, AgentResult, WorkflowTransition } from '@prisma/client';
import { AgentRole } from './workflow';

// Re-export AgentRole for convenience
export { AgentRole };

// ============================================================================
// Workflow Repository Types
// ============================================================================

export type WorkflowStatus = 'PENDING_COMPLEXITY' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
export type Complexity = 'simple' | 'moderate' | 'complex';

export interface WorkflowCreateInput {
  sessionId?: string;
  userPrompt: string;
  chainName: string;
  complexity: Complexity;
  draftComplexity?: Complexity;
  currentStep?: number;
  status?: WorkflowStatus;
}

export interface SetComplexityData {
  complexity: Complexity;
  reasoning?: string;
}

export interface WorkflowFindByIdOptions {
  includeAgentResults?: boolean;
  includeTransitions?: boolean;
}

export interface WorkflowWithRelations extends Workflow {
  agentResults?: AgentResult[];
  transitions?: WorkflowTransition[];
}

/**
 * Workflow Repository Interface
 *
 * Manages workflow lifecycle: creation, retrieval, status updates, deletion
 */
export interface IWorkflowRepository {
  /**
   * Create a new workflow
   */
  createWorkflow(data: WorkflowCreateInput): Promise<Workflow>;

  /**
   * Find workflow by ID
   * @param options - Optional relations to include
   */
  findById(id: string, options?: WorkflowFindByIdOptions): Promise<WorkflowWithRelations | null>;

  /**
   * Find workflows by status
   */
  findByStatus(status: WorkflowStatus): Promise<Workflow[]>;

  /**
   * Find all active workflows (convenience method)
   */
  findActive(): Promise<Workflow[]>;

  /**
   * Find active workflow by session ID
   * Returns most recent if multiple workflows exist for session
   */
  findActiveBySession(sessionId: string): Promise<Workflow | null>;

  /**
   * Update workflow status and optionally current step
   */
  updateStatus(id: string, status: WorkflowStatus, currentStep?: number): Promise<Workflow>;

  /**
   * Update workflow current step (convenience method for step advancement)
   */
  updateCurrentStep(id: string, currentStep: number): Promise<Workflow>;

  /**
   * Update workflow complexity and advance to ACTIVE status
   * Used when Claude Code determines final complexity
   */
  updateComplexity(id: string, data: SetComplexityData): Promise<Workflow>;

  /**
   * Delete workflow (cascades to agent results and transitions)
   */
  deleteWorkflow(id: string): Promise<boolean>;
}

// ============================================================================
// Agent Result Repository Types
// ============================================================================

export type AgentStatus = 'COMPLETED' | 'FAILED' | 'PARTIAL' | 'SKIPPED';

export interface AgentResultCreateInput {
  workflowId: string;
  agentRole: AgentRole;
  complexity: Complexity;
  stepNumber: number;
  results: string; // JSON blob
  status?: AgentStatus;
}

/**
 * Agent Result Repository Interface
 *
 * Stores agent execution results with idempotency via (workflowId, stepNumber) unique constraint
 */
export interface IAgentResultRepository {
  /**
   * Create agent result
   * @throws Error if (workflowId, stepNumber) already exists (idempotency enforcement)
   */
  createResult(data: AgentResultCreateInput): Promise<AgentResult>;

  /**
   * Find all agent results for a workflow, ordered by step number
   */
  findByWorkflowId(workflowId: string): Promise<AgentResult[]>;

  /**
   * Find agent result by workflow ID and step number
   */
  findByWorkflowIdAndStep(workflowId: string, stepNumber: number): Promise<AgentResult | null>;
}

// ============================================================================
// Workflow Transition Repository Types
// ============================================================================

export interface WorkflowTransitionCreateInput {
  workflowId: string;
  fromStep: number;
  toStep: number;
  fromAgent?: string | null;
  toAgent?: string | null;
  reason?: string;
}

/**
 * Workflow Transition Repository Interface
 *
 * Audit log for workflow state changes, tracking agent handoffs and reasons
 */
export interface ITransitionRepository {
  /**
   * Create transition record
   */
  createTransition(data: WorkflowTransitionCreateInput): Promise<WorkflowTransition>;

  /**
   * Find all transitions for a workflow, ordered chronologically (by createdAt)
   */
  findByWorkflowId(workflowId: string): Promise<WorkflowTransition[]>;

  /**
   * Find latest transition for a workflow
   */
  findLatest(workflowId: string): Promise<WorkflowTransition | null>;
}

// ============================================================================
// Combined Repository Manager (future use)
// ============================================================================

/**
 * Combined repository manager interface
 *
 * Provides unified access to all repositories with transaction support
 */
export interface IRepositoryManager {
  workflows: IWorkflowRepository;
  agentResults: IAgentResultRepository;
  transitions: ITransitionRepository;

  /**
   * Execute operations within a transaction
   */
  transaction<T>(callback: (repos: IRepositoryManager) => Promise<T>): Promise<T>;
}
