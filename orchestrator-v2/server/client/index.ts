/**
 * Type-Safe Orchestrator Client SDK
 *
 * A fully typed client SDK for interacting with the Orchestrator API.
 * Provides runtime validation, automatic retries, and comprehensive error handling.
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { z } from 'zod';

// Import all request/response schemas
import {
  InitRequestSchema,
  InitResponseSchema,
  ParseCommandRequestSchema,
  ParseCommandResponseSchema,
  ExecuteWorkflowRequestSchema,
  ExecuteWorkflowResponseSchema,
  AgentResultRequestSchema,
  AgentResultResponseSchema,
  TodosResponseSchema,
  NextTodoResponseSchema,
  NextTaskResponseSchema,
  WorkflowStatusResponseSchema,
  WorkflowsListResponseSchema,
  HealthCheckResponseSchema,
  DebugWorkflowsResponseSchema,
  DebugWorkflowDetailResponseSchema,
  DebugTaskResponseSchema,
  RecoverWorkflowResponseSchema,
  ResetTaskResponseSchema,
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
  WorkflowStatusResponse,
  WorkflowsListResponse,
  HealthCheckResponse,
  DebugWorkflowsResponse,
  DebugWorkflowDetailResponse,
  DebugTaskResponse,
  RecoverWorkflowResponse,
  ResetTaskResponse
} from '../schemas/api';

import { WorkflowId, TaskId, ErrorResponse, Todo } from '../schemas/common';
import { IOrchestratorClient } from '../../core/interfaces';
import { ParsedCommand } from '../../core/command-parser';
import { TaskParams } from '../types';
import { WorkflowResult } from '../../core/types/common.types';

// Client configuration
export interface OrchestratorClientConfig {
  baseURL: string;
  apiKey?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  validateResponses?: boolean;
  onError?: (error: OrchestratorError) => void;
  onRequest?: (config: AxiosRequestConfig) => void;
  onResponse?: (response: any) => void;
}

// Custom error class for client errors
export class OrchestratorError extends Error {
  public statusCode?: number;
  public details?: any;
  public correlationId?: string;

  constructor(message: string, statusCode?: number, details?: any, correlationId?: string) {
    super(message);
    this.name = 'OrchestratorError';
    this.statusCode = statusCode;
    this.details = details;
    this.correlationId = correlationId;
  }
}

// Main client class
export class OrchestratorClient implements IOrchestratorClient {
  private client: AxiosInstance;
  private config: Required<OrchestratorClientConfig>;

  constructor(config: OrchestratorClientConfig) {
    this.config = {
      baseURL: config.baseURL,
      apiKey: config.apiKey || '',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      validateResponses: config.validateResponses !== false,
      onError: config.onError || (() => {}),
      onRequest: config.onRequest || (() => {}),
      onResponse: config.onResponse || (() => {})
    };

    // Create axios instance
    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {})
      }
    });

    // Add request interceptor
    this.client.interceptors.request.use(
      (config) => {
        this.config.onRequest(config);
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor
    this.client.interceptors.response.use(
      (response) => {
        this.config.onResponse(response);
        return response;
      },
      (error) => this.handleError(error)
    );
  }

  // Error handling with retries
  private async handleError(error: AxiosError): Promise<never> {
    const orchError = new OrchestratorError(
      error.message,
      error.response?.status,
      error.response?.data,
      (error.response?.data as any)?.correlationId
    );

    this.config.onError(orchError);
    throw orchError;
  }

  // Retry logic for failed requests
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      if (attempt >= this.config.retryAttempts) {
        throw error;
      }

      const isRetryable = error instanceof OrchestratorError &&
        error.statusCode !== undefined &&
        (error.statusCode >= 500 || error.statusCode === 429);

      if (!isRetryable) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt));
      return this.retryRequest(requestFn, attempt + 1);
    }
  }

  // Validate response with Zod schema
  private validateResponse<T>(schema: z.ZodSchema<T>, data: unknown): T {
    if (!this.config.validateResponses) {
      return data as T;
    }

    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new OrchestratorError(
          'Response validation failed',
          undefined,
          error.errors
        );
      }
      throw error;
    }
  }

  // ==========================================================================
  // System Endpoints
  // ==========================================================================

  /**
   * Initialize the orchestrator server
   */
  async initialize(config?: any): Promise<void> {
    await this.retryRequest(async () => {
      const response = await this.client.post('/api/init', config || {});
      this.validateResponse(InitResponseSchema, response.data);
    });
  }

  /**
   * Check server health
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.get('/api/health');
      return this.validateResponse(HealthCheckResponseSchema, response.data);
    });
  }

  // ==========================================================================
  // Workflow Endpoints
  // ==========================================================================

  /**
   * Parse a natural language command
   */
  async parseCommand(command: string): Promise<ParsedCommand> {
    const request: ParseCommandRequest = { command };
    ParseCommandRequestSchema.parse(request);

    const result = await this.retryRequest(async () => {
      const response = await this.client.post('/api/parse-command', request);
      return this.validateResponse(ParseCommandResponseSchema, response.data);
    });

    // Convert to ParsedCommand format
    return result as any as ParsedCommand;
  }

  /**
   * Execute a workflow - implementation for IOrchestratorClient
   */
  async executeWorkflow(request: ParsedCommand): Promise<WorkflowResult>;
  async executeWorkflow(request: ExecuteWorkflowRequest): Promise<ExecuteWorkflowResponse>;
  async executeWorkflow(request: ParsedCommand | ExecuteWorkflowRequest): Promise<WorkflowResult | ExecuteWorkflowResponse> {
    // Check if it's a ParsedCommand
    if ('workflowType' in request && 'taskDescription' in request && !('parsedCommand' in request)) {
      // Convert ParsedCommand to ExecuteWorkflowRequest
      const parsedCmd = request as ParsedCommand;
      const execRequest: ExecuteWorkflowRequest = {
        workflowType: parsedCmd.workflowType as any,
        taskDescription: parsedCmd.taskDescription,
        parsedCommand: {
          workflowType: parsedCmd.workflowType as any,
          taskDescription: parsedCmd.taskDescription,
          parameters: parsedCmd.parameters
        },
        complexity: parsedCmd.complexity,
        projectDirectory: parsedCmd.projectDirectory
      };

      const response = await this.retryRequest(async () => {
        const res = await this.client.post('/api/execute', execRequest);
        return this.validateResponse(ExecuteWorkflowResponseSchema, res.data);
      });

      // Convert to WorkflowResult
      const result: WorkflowResult = {
        workflowId: response.workflowId as WorkflowId,
        status: response.status === 'started' ? 'running' : response.status as any,
        completedAt: new Date().toISOString()
      };
      return result;
    }

    // Handle ExecuteWorkflowRequest
    ExecuteWorkflowRequestSchema.parse(request);
    return this.retryRequest(async () => {
      const response = await this.client.post('/api/execute', request);
      return this.validateResponse(ExecuteWorkflowResponseSchema, response.data);
    });
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId: WorkflowId): Promise<WorkflowStatusResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/api/status/${workflowId}`);
      return this.validateResponse(WorkflowStatusResponseSchema, response.data);
    });
  }

  /**
   * List all workflows
   */
  async listWorkflows(): Promise<WorkflowsListResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.get('/api/workflows');
      return this.validateResponse(WorkflowsListResponseSchema, response.data);
    });
  }

  /**
   * Get todos for current workflow (IOrchestratorClient interface)
   */
  async getTodos(): Promise<Todo[]> {
    // Get the first active workflow's todos
    const workflows = await this.listWorkflows();
    if (workflows.workflows.length > 0) {
      const response = await this.retryRequest(async () => {
        const res = await this.client.get(`/api/todos/${workflows.workflows[0].workflowId}`);
        return this.validateResponse(TodosResponseSchema, res.data);
      });
      return response.todos;
    }
    return [];
  }

  /**
   * Get todos for a specific workflow
   */
  async getTodosForWorkflow(workflowId: WorkflowId): Promise<TodosResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/api/todos/${workflowId}`);
      return this.validateResponse(TodosResponseSchema, response.data);
    });
  }

  /**
   * Get next pending todo (IOrchestratorClient interface)
   */
  async getNextTodo(): Promise<Todo | null> {
    // Get the first active workflow's next todo
    const workflows = await this.listWorkflows();
    if (workflows.workflows.length > 0) {
      const response = await this.retryRequest(async () => {
        const res = await this.client.get(`/api/next-todo/${workflows.workflows[0].workflowId}`);
        return this.validateResponse(NextTodoResponseSchema, res.data);
      });
      return response.todo || null;
    }
    return null;
  }

  /**
   * Get next pending todo for a specific workflow
   */
  async getNextTodoForWorkflow(workflowId: WorkflowId): Promise<NextTodoResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/api/next-todo/${workflowId}`);
      return this.validateResponse(NextTodoResponseSchema, response.data);
    });
  }

  // ==========================================================================
  // Task Endpoints
  // ==========================================================================

  /**
   * Get next pending task (IOrchestratorClient interface)
   */
  async getNextTask(): Promise<TaskParams | null> {
    // Get the first active workflow's next task
    const workflows = await this.listWorkflows();
    if (workflows.workflows.length > 0) {
      const response = await this.retryRequest(async () => {
        const res = await this.client.get(`/api/next-task/${workflows.workflows[0].workflowId}`);
        return this.validateResponse(NextTaskResponseSchema, res.data);
      });
      // Check if response has params (first union member)
      if ('params' in response && response.params) {
        return response.params;
      }
      return null;
    }
    return null;
  }

  /**
   * Get next pending task for a specific workflow
   */
  async getNextTaskForWorkflow(workflowId: WorkflowId): Promise<NextTaskResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/api/next-task/${workflowId}`);
      return this.validateResponse(NextTaskResponseSchema, response.data);
    });
  }

  /**
   * Submit agent execution result (IOrchestratorClient interface)
   */
  async submitAgentResult(result: any): Promise<void> {
    const request = result as AgentResultRequest;
    AgentResultRequestSchema.parse(request);

    await this.retryRequest(async () => {
      const response = await this.client.post('/api/agent-result', request);
      this.validateResponse(AgentResultResponseSchema, response.data);
    });
  }

  // IHttpClient interface methods
  async get<T>(url: string, config?: any): Promise<T> {
    return this.retryRequest(async () => {
      const response = await this.client.get(url, config);
      return response.data as T;
    });
  }

  async post<T>(url: string, data?: any, config?: any): Promise<T> {
    return this.retryRequest(async () => {
      const response = await this.client.post(url, data, config);
      return response.data as T;
    });
  }

  async put<T>(url: string, data?: any, config?: any): Promise<T> {
    return this.retryRequest(async () => {
      const response = await this.client.put(url, data, config);
      return response.data as T;
    });
  }

  async delete<T>(url: string, config?: any): Promise<T> {
    return this.retryRequest(async () => {
      const response = await this.client.delete(url, config);
      return response.data as T;
    });
  }

  async patch<T>(url: string, data?: any, config?: any): Promise<T> {
    return this.retryRequest(async () => {
      const response = await this.client.patch(url, data, config);
      return response.data as T;
    });
  }

  // ==========================================================================
  // Debug Endpoints
  // ==========================================================================

  /**
   * Get all system state for debugging
   */
  async debugGetAllWorkflows(): Promise<DebugWorkflowsResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.get('/api/debug/workflows');
      return this.validateResponse(DebugWorkflowsResponseSchema, response.data);
    });
  }

  /**
   * Get detailed workflow debug information
   */
  async debugGetWorkflow(workflowId: WorkflowId): Promise<DebugWorkflowDetailResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/api/debug/workflow/${workflowId}`);
      return this.validateResponse(DebugWorkflowDetailResponseSchema, response.data);
    });
  }

  /**
   * Get detailed task debug information
   */
  async debugGetTask(taskId: TaskId): Promise<DebugTaskResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.get(`/api/debug/task/${taskId}`);
      return this.validateResponse(DebugTaskResponseSchema, response.data);
    });
  }

  // ==========================================================================
  // Recovery Endpoints
  // ==========================================================================

  /**
   * Attempt to recover a stuck workflow
   */
  async recoverWorkflow(workflowId: WorkflowId): Promise<RecoverWorkflowResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.post(`/api/recover-workflow/${workflowId}`);
      return this.validateResponse(RecoverWorkflowResponseSchema, response.data);
    });
  }

  /**
   * Reset a stuck task
   */
  async resetTask(taskId: TaskId): Promise<ResetTaskResponse> {
    return this.retryRequest(async () => {
      const response = await this.client.post(`/api/reset-task/${taskId}`);
      return this.validateResponse(ResetTaskResponseSchema, response.data);
    });
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Wait for workflow completion with polling
   */
  async waitForWorkflowCompletion(
    workflowId: WorkflowId,
    options?: {
      pollInterval?: number;
      timeout?: number;
      onProgress?: (status: WorkflowStatusResponse) => void;
    }
  ): Promise<WorkflowStatusResponse> {
    const pollInterval = options?.pollInterval || 2000;
    const timeout = options?.timeout || 600000; // 10 minutes default
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getWorkflowStatus(workflowId);

      if (options?.onProgress) {
        options.onProgress(status);
      }

      if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
        return status;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new OrchestratorError(`Timeout waiting for workflow ${workflowId} to complete`);
  }

  /**
   * Execute workflow and wait for completion
   */
  async executeAndWait(
    request: ExecuteWorkflowRequest,
    options?: Parameters<typeof this.waitForWorkflowCompletion>[1]
  ): Promise<WorkflowStatusResponse> {
    const execution = await this.executeWorkflow(request);
    return this.waitForWorkflowCompletion(execution.workflowId, options);
  }

  /**
   * Stream workflow updates using Server-Sent Events (if supported)
   */
  async *streamWorkflowUpdates(workflowId: WorkflowId): AsyncGenerator<WorkflowStatusResponse> {
    // This would require WebSocket or SSE implementation
    // For now, we'll use polling
    let lastStatus: WorkflowStatusResponse | null = null;

    while (true) {
      const status = await this.getWorkflowStatus(workflowId);

      if (!lastStatus || JSON.stringify(status) !== JSON.stringify(lastStatus)) {
        lastStatus = status;
        yield status;
      }

      if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// Export a factory function for convenience
export function createOrchestratorClient(config: OrchestratorClientConfig): OrchestratorClient {
  return new OrchestratorClient(config);
}

// Export all types for consumer convenience
export * from '../schemas/api';
export * from '../schemas/common';
export type { WorkflowState, PendingTask, TaskParams } from '../types';