/**
 * Enhanced Type Definitions for Server Components
 *
 * This module provides improved type definitions for server-specific
 * components, replacing generic 'any' types with proper typing.
 */

import {
  WorkflowId,
  TaskId,
  AgentType,
  WorkflowStatus,
  ComplexityLevel,
  WorkflowType
} from '../schemas/common';
import {
  AgentResultRequest
} from '../schemas/api';
import { ParsedCommand } from '../../core/command-parser';
import { PluginInstance, WorkflowDefinition } from '../../core/types/common.types';

// ============================================================================
// Route Handler Types
// ============================================================================

export interface RouteHandlerContext {
  orchestratorInstance: OrchestratorInstance;
  workflowLoader: WorkflowLoaderInstance;
  stateManager?: StateManagerInstance;
  serverLogger?: LoggerInstance;
  correlationId: string;
}

export interface OrchestratorInstance {
  initialize(config?: Record<string, unknown>): Promise<void>;
  isInitialized(): boolean;
  parseCommand(input: string): ParsedCommand | null;
  executeWorkflow(command: ParsedCommand): Promise<WorkflowId>;
  getAvailableWorkflows(): WorkflowType[];
  shutdown(): Promise<void>;
}

export interface WorkflowLoaderInstance {
  loadWorkflow(type: WorkflowType): Promise<WorkflowDefinition | null>;
  getWorkflowDefinition(type: WorkflowType): WorkflowDefinition | null;
  validateWorkflow(workflow: WorkflowDefinition): boolean;
}

export interface StateManagerInstance {
  updateWorkflowStatus(workflowId: WorkflowId, status: WorkflowStatus): Promise<void>;
  getWorkflowState(workflowId: WorkflowId): Promise<unknown>;
  updateTaskStatus(taskId: TaskId, status: string): Promise<void>;
}

export interface LoggerInstance {
  generateCorrelationId(): string;
  logRequest(method: string, path: string, correlationId?: string): void;
  logResponse(method: string, path: string, statusCode: number, duration: number, correlationId?: string): void;
  logWithContext(level: string, context: string, message: string, metadata?: Record<string, unknown>): void;
  workflowStarted(workflowId: WorkflowId, workflowType: string, taskDescription: string): void;
  workflowCompleted(workflowId: WorkflowId, duration: number): void;
  taskCreated(taskId: TaskId, agentType: AgentType, workflowId: WorkflowId): void;
  taskCompleted(taskId: TaskId, duration: number, success: boolean): void;
}

// ============================================================================
// Workflow Agent Types
// ============================================================================

export interface WorkflowAgent {
  name: string;
  type: AgentType;
  config?: Record<string, unknown>;
  required?: boolean;
  timeout?: number;
}

export interface WorkflowSequence {
  sequence: WorkflowAgent[];
  parallel?: WorkflowAgent[];
}

// ============================================================================
// Enhanced Task Types
// ============================================================================

export interface ExtendedTaskParams {
  subagent_type: AgentType;
  description: string;
  prompt: string;
  projectDirectory?: string;
  complexity?: ComplexityLevel;
  metadata?: Record<string, unknown>;
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}

export interface TaskExecutionContext {
  taskId: TaskId;
  workflowId: WorkflowId;
  params: ExtendedTaskParams;
  startTime: string;
  timeout?: NodeJS.Timeout;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  metadata?: {
    timestamp: string;
    correlationId?: string;
    duration?: number;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: unknown;
  correlationId?: string;
  stackTrace?: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// OpenAPI Types
// ============================================================================

export interface OpenAPIDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
  security?: Array<Record<string, string[]>>;
}

export interface PathItem {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  delete?: OperationObject;
  patch?: OperationObject;
  parameters?: ParameterObject[];
}

export interface OperationObject {
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: ParameterObject[];
  requestBody?: RequestBody;
  responses: Record<string, ResponseObject>;
  tags?: string[];
  security?: Array<Record<string, string[]>>;
}

export interface ParameterObject {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: SchemaObject;
}

export interface RequestBody {
  description?: string;
  content: Record<string, MediaType>;
  required?: boolean;
}

export interface ResponseObject {
  description: string;
  content?: Record<string, MediaType>;
}

export interface MediaType {
  schema?: SchemaObject;
  example?: unknown;
  examples?: Record<string, ExampleObject>;
}

export interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  required?: string[];
  description?: string;
  enum?: unknown[];
  format?: string;
  $ref?: string;
}

export interface ExampleObject {
  summary?: string;
  description?: string;
  value?: unknown;
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
}

// ============================================================================
// Client Configuration Types
// ============================================================================

export interface EnhancedClientConfig {
  baseURL: string;
  apiKey?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  validateResponses?: boolean;
  onError?: (error: ClientError) => void;
  onRequest?: (config: RequestConfig) => void;
  onResponse?: (response: ResponseData) => void;
}

export interface ClientError extends Error {
  statusCode?: number;
  details?: unknown;
  correlationId?: string;
  request?: RequestConfig;
  response?: ResponseData;
}

export interface RequestConfig {
  method: string;
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  data?: unknown;
  timeout?: number;
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isApiSuccessResponse<T>(response: ApiResponse<T>): response is ApiSuccessResponse<T> {
  return response.success === true;
}

export function isApiErrorResponse(response: ApiResponse): response is ApiErrorResponse {
  return response.success === false;
}

export function isWorkflowAgent(obj: unknown): obj is WorkflowAgent {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    'type' in obj
  );
}

export function isTaskExecutionContext(obj: unknown): obj is TaskExecutionContext {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'taskId' in obj &&
    'workflowId' in obj &&
    'params' in obj &&
    'status' in obj
  );
}