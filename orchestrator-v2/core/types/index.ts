/**
 * Core Types Export Module
 *
 * Central export point for all type definitions used throughout
 * the Orchestrator V2 application.
 */

// Re-export all common types
export * from './common.types';

// Selectively re-export from other modules to avoid conflicts
export {
  StateEvent,
  StateSnapshot,
  WorkflowState as CoreWorkflowState,
  TaskState,
  AgentState
} from '../state/types';

export {
  WorkflowVersion,
  WorkflowAST,
  WorkflowMigration
} from '../workflow/types';

export {
  ExecutionEvent,
  ExecutionStatus,
  ExecutionTrace,
  ExecutionMetrics
} from '../execution/types';

export {
  IntegrationEvent,
  HookDefinition
} from '../integration/types';

export {
  AgentPlugin,
  ComplexityLevel as PluginComplexityLevel,
  AgentCapability,
  PluginManifest
} from '../plugins/types';

// Re-export server types
export type {
  WorkflowState,
  PendingTask,
  TaskParams
} from '../../server/types';

// Re-export schema types
export type {
  WorkflowId,
  TaskId,
  CorrelationId,
  AgentType,
  WorkflowStatus,
  Todo,
  ComplexityLevel
} from '../../server/schemas/common';

export type {
  InitRequest,
  InitResponse,
  ParseCommandRequest,
  ParseCommandResponse,
  ExecuteWorkflowRequest,
  ExecuteWorkflowResponse,
  AgentResultRequest,
  AgentResultResponse,
  TodosResponse,
  NextTodoResponse,
  NextTaskResponse,
  WorkflowStatusResponse
} from '../../server/schemas/api';