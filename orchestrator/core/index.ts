export { Orchestrator } from './orchestrator.js';
export { OrchestrationInterface } from './orchestration-interface.js';
export { CommandParser } from './command-parser.js';
export { WorkflowLoader } from './workflow-loader.js';
export { WorkflowStateManager } from './workflow-state-manager.js';
export { SchemaValidator } from './schema-validator.js';

export type {
  WorkflowDefinition,
  WorkflowState,
  AgentExecution,
  WorkflowAgent,
  ParallelAgentGroup,
  ConditionalAgentGroup,
  AgentResult,
  OrchestrationConfig,
  WorkflowMetrics,
  ParsedCommand,
  StepState
} from './types.js';

export type {
  ValidationResult,
  ValidationError
} from './schema-validator.js';

import { OrchestrationInterface } from './orchestration-interface.js';
import type { OrchestrationConfig } from './types.js';

// Main orchestration interface for easy consumption
export async function createOrchestrationInterface(config?: Partial<OrchestrationConfig>) {
  const orchestration = new OrchestrationInterface(config);
  await orchestration.initialize();
  return orchestration;
}