/**
 * Custom Error Classes for Orchestrator V2
 *
 * This module provides specific error classes for different error scenarios
 * in the orchestrator system, improving error handling and debugging.
 */

/**
 * Base error class for all orchestrator errors
 */
export abstract class OrchestratorBaseError extends Error {
  public code: string;
  public statusCode: number;
  public readonly timestamp: Date;
  public context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date();
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * Workflow-related errors
 */
export class WorkflowError extends OrchestratorBaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'WORKFLOW_ERROR', 400, context);
  }
}

export class WorkflowNotFoundError extends WorkflowError {
  constructor(workflowId: string) {
    super(`Workflow ${workflowId} not found`, { workflowId });
    this.code = 'WORKFLOW_NOT_FOUND';
    this.statusCode = 404;
  }
}

export class WorkflowValidationError extends WorkflowError {
  constructor(message: string, validationErrors?: any[]) {
    super(message, { validationErrors });
    this.code = 'WORKFLOW_VALIDATION_ERROR';
    this.statusCode = 422;
  }
}

export class WorkflowExecutionError extends WorkflowError {
  constructor(message: string, workflowId?: string, stage?: string) {
    super(message, { workflowId, stage });
    this.code = 'WORKFLOW_EXECUTION_ERROR';
    this.statusCode = 500;
  }
}

export class WorkflowTimeoutError extends WorkflowError {
  constructor(workflowId: string, timeout: number) {
    super(`Workflow ${workflowId} timed out after ${timeout}ms`, { workflowId, timeout });
    this.code = 'WORKFLOW_TIMEOUT';
    this.statusCode = 408;
  }
}

/**
 * Task-related errors
 */
export class TaskError extends OrchestratorBaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TASK_ERROR', 400, context);
  }
}

export class TaskNotFoundError extends TaskError {
  constructor(taskId: string) {
    super(`Task ${taskId} not found`, { taskId });
    this.code = 'TASK_NOT_FOUND';
    this.statusCode = 404;
  }
}

export class TaskExecutionError extends TaskError {
  constructor(message: string, taskId?: string, agentType?: string) {
    super(message, { taskId, agentType });
    this.code = 'TASK_EXECUTION_ERROR';
    this.statusCode = 500;
  }
}

export class TaskTimeoutError extends TaskError {
  constructor(taskId: string, timeout: number) {
    super(`Task ${taskId} timed out after ${timeout}ms`, { taskId, timeout });
    this.code = 'TASK_TIMEOUT';
    this.statusCode = 408;
  }
}

export class NoActiveWorkflowError extends TaskError {
  constructor() {
    super('No active workflow for task execution');
    this.code = 'NO_ACTIVE_WORKFLOW';
    this.statusCode = 409;
  }
}

/**
 * Agent-related errors
 */
export class AgentError extends OrchestratorBaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AGENT_ERROR', 400, context);
  }
}

export class AgentNotFoundError extends AgentError {
  constructor(agentName: string) {
    super(`Agent ${agentName} not found`, { agentName });
    this.code = 'AGENT_NOT_FOUND';
    this.statusCode = 404;
  }
}

export class AgentExecutionError extends AgentError {
  constructor(message: string, agentName?: string, error?: any) {
    super(message, { agentName, originalError: error });
    this.code = 'AGENT_EXECUTION_ERROR';
    this.statusCode = 500;
  }
}

export class AgentCapabilityError extends AgentError {
  constructor(agentName: string, capability: string) {
    super(`Agent ${agentName} does not have capability: ${capability}`, { agentName, capability });
    this.code = 'AGENT_CAPABILITY_ERROR';
    this.statusCode = 422;
  }
}

/**
 * Plugin-related errors
 */
export class PluginError extends OrchestratorBaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PLUGIN_ERROR', 400, context);
  }
}

export class PluginNotFoundError extends PluginError {
  constructor(pluginId: string) {
    super(`Plugin ${pluginId} not found`, { pluginId });
    this.code = 'PLUGIN_NOT_FOUND';
    this.statusCode = 404;
  }
}

export class PluginLoadError extends PluginError {
  constructor(pluginId: string, error: any) {
    super(`Failed to load plugin ${pluginId}: ${error.message}`, { pluginId, originalError: error });
    this.code = 'PLUGIN_LOAD_ERROR';
    this.statusCode = 500;
  }
}

export class PluginValidationError extends PluginError {
  constructor(pluginId: string, validationErrors: string[]) {
    super(`Plugin ${pluginId} validation failed`, { pluginId, validationErrors });
    this.code = 'PLUGIN_VALIDATION_ERROR';
    this.statusCode = 422;
  }
}

/**
 * State management errors
 */
export class StateError extends OrchestratorBaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'STATE_ERROR', 400, context);
  }
}

export class StateNotFoundError extends StateError {
  constructor(stateType: string, id: string) {
    super(`${stateType} state ${id} not found`, { stateType, id });
    this.code = 'STATE_NOT_FOUND';
    this.statusCode = 404;
  }
}

export class StateMigrationError extends StateError {
  constructor(message: string, errors: any[]) {
    super(message, { migrationErrors: errors });
    this.code = 'STATE_MIGRATION_ERROR';
    this.statusCode = 500;
  }
}

export class StateValidationError extends StateError {
  constructor(message: string, validationErrors: any[]) {
    super(message, { validationErrors });
    this.code = 'STATE_VALIDATION_ERROR';
    this.statusCode = 422;
  }
}

/**
 * Integration errors
 */
export class IntegrationConnectionError extends OrchestratorBaseError {
  constructor(message: string, connectionId?: string) {
    super(message, 'CONNECTION_ERROR', 503, { connectionId });
  }
}

export class IntegrationAuthenticationError extends OrchestratorBaseError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class IntegrationAuthorizationError extends OrchestratorBaseError {
  constructor(message: string = 'Authorization failed') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends OrchestratorBaseError {
  constructor(message: string, configKey?: string) {
    super(message, 'CONFIGURATION_ERROR', 500, { configKey });
  }
}

export class MissingConfigurationError extends ConfigurationError {
  constructor(configKey: string) {
    super(`Required configuration '${configKey}' is missing`, configKey);
    this.code = 'MISSING_CONFIGURATION';
  }
}

export class InvalidConfigurationError extends ConfigurationError {
  constructor(configKey: string, value: any, reason?: string) {
    super(`Invalid configuration for '${configKey}': ${reason || 'Invalid value'}`, configKey);
    this.context = { configKey, value, reason };
    this.code = 'INVALID_CONFIGURATION';
  }
}

/**
 * Hook errors
 */
export class HookError extends OrchestratorBaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'HOOK_ERROR', 400, context);
  }
}

export class HookValidationError extends HookError {
  constructor(hookName: string, validationError: string) {
    super(`Hook ${hookName} validation failed: ${validationError}`, { hookName, validationError });
    this.code = 'HOOK_VALIDATION_ERROR';
    this.statusCode = 422;
  }
}

export class HookExecutionError extends HookError {
  constructor(hookName: string, error: any) {
    super(`Hook ${hookName} execution failed: ${error.message}`, { hookName, originalError: error });
    this.code = 'HOOK_EXECUTION_ERROR';
    this.statusCode = 500;
  }
}

/**
 * Retry and circuit breaker errors
 */
export class RetryExhaustedError extends OrchestratorBaseError {
  constructor(operation: string, attempts: number, lastError?: any) {
    super(`Retry exhausted for ${operation} after ${attempts} attempts`, 'RETRY_EXHAUSTED', 503, {
      operation,
      attempts,
      lastError
    });
  }
}

export class CircuitBreakerOpenError extends OrchestratorBaseError {
  constructor(operation: string) {
    super(`Circuit breaker is open for operation: ${operation}`, 'CIRCUIT_BREAKER_OPEN', 503, {
      operation
    });
  }
}

/**
 * Error factory for creating specific errors based on error codes
 */
export class ErrorFactory {
  static createFromCode(code: string, message: string, context?: Record<string, unknown>): OrchestratorBaseError {
    switch (code) {
      case 'WORKFLOW_NOT_FOUND':
        return new WorkflowNotFoundError(context?.workflowId as string || 'unknown');
      case 'TASK_NOT_FOUND':
        return new TaskNotFoundError(context?.taskId as string || 'unknown');
      case 'AGENT_NOT_FOUND':
        return new AgentNotFoundError(context?.agentName as string || 'unknown');
      case 'PLUGIN_NOT_FOUND':
        return new PluginNotFoundError(context?.pluginId as string || 'unknown');
      case 'NO_ACTIVE_WORKFLOW':
        return new NoActiveWorkflowError();
      case 'AUTHENTICATION_ERROR':
        return new IntegrationAuthenticationError(message);
      case 'AUTHORIZATION_ERROR':
        return new IntegrationAuthorizationError(message);
      default:
        // Return a generic error for unknown codes
        return new class extends OrchestratorBaseError {
          constructor() {
            super(message, code, 500, context);
          }
        }();
    }
  }

  static isOrchestratorError(error: any): error is OrchestratorBaseError {
    return error instanceof OrchestratorBaseError;
  }
}

/**
 * Error handler utility for consistent error responses
 */
export class ErrorHandler {
  static handle(error: any): {
    statusCode: number;
    error: {
      code: string;
      message: string;
      context?: Record<string, unknown>;
      stack?: string;
    };
  } {
    if (ErrorFactory.isOrchestratorError(error)) {
      return {
        statusCode: error.statusCode,
        error: {
          code: error.code,
          message: error.message,
          context: error.context,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      };
    }

    // Handle generic errors
    return {
      statusCode: 500,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
  }
}