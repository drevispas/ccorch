/**
 * Domain Models & Types
 *
 * Purpose: Define core domain types, enums, and runtime validation schemas
 * for workflow orchestration.
 *
 * These types represent the business domain model and include Zod schemas
 * for runtime validation of external inputs.
 */

import { z } from 'zod';

// ============================================================================
// Workflow Chain Enums
// ============================================================================

/**
 * Workflow chain names as defined in PRD §4.2
 */
export enum ChainName {
  BACKEND_DEVELOPMENT = 'backend-development',
  FRONTEND_DEVELOPMENT = 'frontend-development',
  DEBUG = 'debug',
  REVIEW = 'review',
  BACKEND_DESIGN_ONLY = 'backend-design-only',
  FRONTEND_DESIGN_ONLY = 'frontend-design-only',
  BACKEND_ONLY = 'backend-only',
  FRONTEND_ONLY = 'frontend-only',
  REVIEW_ONLY = 'review-only',
  DEBUG_ONLY = 'debug-only',
}

/**
 * Task complexity levels (PRD §5.2)
 */
export enum Complexity {
  SIMPLE = 'simple',
  MODERATE = 'moderate',
  COMPLEX = 'complex',
}

/**
 * Agent roles in workflow chains (PRD §3.1)
 */
export enum AgentRole {
  BACKEND_ARCHITECT = 'backend-architect',
  FRONTEND_ARCHITECT = 'frontend-architect',
  BACKEND_DEVELOPER = 'backend-developer',
  FRONTEND_DEVELOPER = 'frontend-developer',
  REVIEWER = 'reviewer',
  DEBUGGER = 'debugger',
  E2E_TEST_ARCHITECT = 'e2e-test-architect',
}

/**
 * Workflow lifecycle states
 */
export enum WorkflowStatus {
  PENDING_COMPLEXITY = 'PENDING_COMPLEXITY',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// ============================================================================
// Intent & Context Types
// ============================================================================

/**
 * Parsed user intent from prompt analysis
 *
 * Contains identified agent roles and extracted keywords for
 * chain resolution and complexity determination.
 */
export interface Intent {
  /** Agent roles identified in the user prompt */
  roles: AgentRole[];
  /** Keywords extracted from prompt for analysis */
  keywords: string[];
}

/**
 * Workflow context for agent execution
 *
 * Contains all contextual information needed by agents to
 * perform their tasks within a workflow chain.
 */
export interface WorkflowContext {
  /** Unique workflow identifier */
  workflowId: string;
  /** Original user prompt */
  userPrompt: string;
  /** Selected workflow chain */
  chainName: ChainName;
  /** Determined complexity level */
  complexity: Complexity;
  /** Current step in the chain (0-indexed) */
  currentStep: number;
  /** Results from previous agents (if any) */
  previousAgentResults?: AgentResultData[];
}

/**
 * Agent task definition
 *
 * Represents a specific task assigned to an agent in the workflow chain.
 */
export interface AgentTask {
  /** Agent role for this task */
  role: AgentRole;
  /** Complexity level for agent selection */
  complexity: Complexity;
  /** Step number in the chain */
  stepNumber: number;
  /** Task description/instructions */
  instructions: string;
  /** Context from workflow */
  context: WorkflowContext;
}

/**
 * Agent result data structure
 *
 * Structured output from agent execution.
 */
export interface AgentResultData {
  /** Summary of agent's work */
  summary: string;
  /** Design decisions (architects only) */
  design?: string;
  /** Files modified (developers only) */
  filesModified?: string[];
  /** Issues found (reviewers/debuggers only) */
  issuesFound?: string[];
  /** Recommendations for next steps */
  recommendations?: string[];
}

// ============================================================================
// Zod Schemas for Runtime Validation
// ============================================================================

/**
 * ChainName validation schema
 */
export const ChainNameSchema = z.nativeEnum(ChainName);

/**
 * Complexity validation schema
 */
export const ComplexitySchema = z.nativeEnum(Complexity);

/**
 * AgentRole validation schema
 */
export const AgentRoleSchema = z.nativeEnum(AgentRole);

/**
 * WorkflowStatus validation schema
 */
export const WorkflowStatusSchema = z.nativeEnum(WorkflowStatus);

/**
 * Intent validation schema
 */
export const IntentSchema = z.object({
  roles: z.array(AgentRoleSchema).min(1, 'At least one role must be identified'),
  keywords: z.array(z.string()).default([]),
});

/**
 * WorkflowContext validation schema
 */
export const WorkflowContextSchema = z.object({
  workflowId: z.string().uuid('Workflow ID must be a valid UUID'),
  userPrompt: z.string().min(1, 'User prompt cannot be empty'),
  chainName: ChainNameSchema,
  complexity: ComplexitySchema,
  currentStep: z.number().int().min(0, 'Current step must be non-negative'),
  previousAgentResults: z.array(
    z.object({
      summary: z.string(),
      design: z.string().optional(),
      filesModified: z.array(z.string()).optional(),
      issuesFound: z.array(z.string()).optional(),
      recommendations: z.array(z.string()).optional(),
    })
  ).optional(),
});

/**
 * AgentTask validation schema
 */
export const AgentTaskSchema = z.object({
  role: AgentRoleSchema,
  complexity: ComplexitySchema,
  stepNumber: z.number().int().min(0, 'Step number must be non-negative'),
  instructions: z.string().min(1, 'Instructions cannot be empty'),
  context: WorkflowContextSchema,
});

/**
 * AgentResultData validation schema
 */
export const AgentResultDataSchema = z.object({
  summary: z.string().min(1, 'Summary is required'),
  design: z.string().optional(),
  filesModified: z.array(z.string()).optional(),
  issuesFound: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional(),
});

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a string is a valid ChainName
 */
export function isChainName(value: string): value is ChainName {
  return Object.values(ChainName).includes(value as ChainName);
}

/**
 * Type guard to check if a string is a valid Complexity
 */
export function isComplexity(value: string): value is Complexity {
  return Object.values(Complexity).includes(value as Complexity);
}

/**
 * Type guard to check if a string is a valid AgentRole
 */
export function isAgentRole(value: string): value is AgentRole {
  return Object.values(AgentRole).includes(value as AgentRole);
}

/**
 * Type guard to check if a string is a valid WorkflowStatus
 */
export function isWorkflowStatus(value: string): value is WorkflowStatus {
  return Object.values(WorkflowStatus).includes(value as WorkflowStatus);
}
