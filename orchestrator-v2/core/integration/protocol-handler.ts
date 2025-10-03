import { v4 as uuidv4 } from 'uuid';

import {
  WebSocketConnection,
  BaseMessage,
  RequestMessage,
  ResponseMessage,
  EventMessage,
  MessageType,
  ExecuteWorkflowRequest,
  SubscribeRequest,
  HookRegistration,
  IntegrationError,
  IntegrationErrorCode,
  ExecuteWorkflowRequestSchema,
  SubscribeRequestSchema,
  HookRegistrationSchema,
} from './types';

import { HookManager, HookExecutionResult } from './hook-manager';
import { ReactiveExecutionEngine } from '../execution/reactive-execution-engine';
import { EventDrivenStateManager } from '../state/event-driven-state-manager';
import { ResponseStatus } from '../enums';

export interface MessageProtocolHandlerDependencies {
  hookManager: HookManager;
  executionEngine?: ReactiveExecutionEngine;
  stateManager?: EventDrivenStateManager;
}

export class MessageProtocolHandler {
  private hookManager: HookManager;
  private executionEngine?: ReactiveExecutionEngine;
  private stateManager?: EventDrivenStateManager;

  // Message correlation tracking
  private pendingRequests: Map<string, {
    connection: WebSocketConnection;
    message: BaseMessage;
    timestamp: Date;
    timeout?: NodeJS.Timeout;
  }> = new Map();

  // Request timeout (30 seconds)
  private readonly REQUEST_TIMEOUT = 30000;

  constructor(hookManager: HookManager, dependencies?: Partial<MessageProtocolHandlerDependencies>) {
    this.hookManager = hookManager;
    this.executionEngine = dependencies?.executionEngine;
    this.stateManager = dependencies?.stateManager;
  }

  public setDependencies(dependencies: Partial<MessageProtocolHandlerDependencies>): void {
    if (dependencies.executionEngine) {
      this.executionEngine = dependencies.executionEngine;
    }
    if (dependencies.stateManager) {
      this.stateManager = dependencies.stateManager;
    }
  }

  public async handleMessage(connection: WebSocketConnection, message: BaseMessage): Promise<void> {
    try {
      switch (message.type) {
        case MessageType.SUBSCRIBE:
          await this.handleSubscribeMessage(connection, message as RequestMessage<SubscribeRequest>);
          break;

        case MessageType.UNSUBSCRIBE:
          await this.handleUnsubscribeMessage(connection, message);
          break;

        case MessageType.EXECUTE_WORKFLOW:
          await this.handleExecuteWorkflowMessage(connection, message as RequestMessage<ExecuteWorkflowRequest>);
          break;

        case MessageType.PAUSE_WORKFLOW:
        case MessageType.RESUME_WORKFLOW:
        case MessageType.CANCEL_WORKFLOW:
          await this.handleWorkflowControlMessage(connection, message);
          break;

        case MessageType.HOOK_REGISTER:
          await this.handleHookRegisterMessage(connection, message as RequestMessage<HookRegistration>);
          break;

        case MessageType.HOOK_EXECUTE:
          await this.handleHookExecuteMessage(connection, message);
          break;

        case MessageType.HOOK_RESULT:
          await this.handleHookResultMessage(connection, message);
          break;

        default:
          throw new Error(`Unsupported message type: ${message.type}`);
      }
    } catch (error) {
      await this.sendErrorResponse(connection, message, error);
    }
  }

  private async handleSubscribeMessage(
    connection: WebSocketConnection,
    message: RequestMessage<SubscribeRequest>
  ): Promise<void> {
    try {
      // Validate subscription request
      const subscribeRequest = SubscribeRequestSchema.parse(message.payload);

      // This would be handled by the StreamingBridge
      // For now, we'll emit an event that the WebSocketServer can listen to
      const response = {
        subscriptionId: uuidv4(),
        subscriptionType: subscribeRequest.subscriptionType,
        status: ResponseStatus.CONFIRMED,
        message: 'Subscription created successfully',
      };

      await this.sendSuccessResponse(connection, message, response);

      // Emit event for external handling
      this.emitMessage('subscription_request', {
        connection,
        subscribeRequest,
        messageId: message.id,
      });

    } catch (error) {
      throw new IntegrationError(
        `Subscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        IntegrationErrorCode.SUBSCRIPTION_FAILED
      );
    }
  }

  private async handleUnsubscribeMessage(
    connection: WebSocketConnection,
    message: BaseMessage
  ): Promise<void> {
    try {
      const subscriptionId = (message as any).payload?.subscriptionId;
      if (!subscriptionId) {
        throw new Error('Subscription ID is required');
      }

      const response = {
        subscriptionId,
        status: ResponseStatus.UNSUBSCRIBED,
        message: 'Subscription cancelled successfully',
      };

      await this.sendSuccessResponse(connection, message, response);

      // Emit event for external handling
      this.emitMessage('unsubscription_request', {
        connection,
        subscriptionId,
        messageId: message.id,
      });

    } catch (error) {
      throw new IntegrationError(
        `Unsubscription failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        IntegrationErrorCode.SUBSCRIPTION_FAILED
      );
    }
  }

  private async handleExecuteWorkflowMessage(
    connection: WebSocketConnection,
    message: RequestMessage<ExecuteWorkflowRequest>
  ): Promise<void> {
    try {
      // Validate workflow execution request
      const workflowRequest = ExecuteWorkflowRequestSchema.parse(message.payload);

      if (!this.executionEngine) {
        throw new Error('Execution engine not available');
      }

      // Start workflow execution
      const workflowId = uuidv4();
      const response = {
        workflowId,
        status: ResponseStatus.STARTED,
        message: 'Workflow execution initiated',
        streamingEnabled: workflowRequest.options?.streamExecution ?? true,
      };

      await this.sendSuccessResponse(connection, message, response);

      // Emit event for external handling (actual execution)
      this.emitMessage('workflow_execution_request', {
        connection,
        workflowRequest,
        workflowId,
        messageId: message.id,
      });

    } catch (error) {
      throw new IntegrationError(
        `Workflow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        IntegrationErrorCode.PROTOCOL_ERROR
      );
    }
  }

  private async handleWorkflowControlMessage(
    connection: WebSocketConnection,
    message: BaseMessage
  ): Promise<void> {
    try {
      const workflowId = (message as any).payload?.workflowId;
      if (!workflowId) {
        throw new Error('Workflow ID is required');
      }

      let actionResult: any;
      const action = message.type.toLowerCase().replace('_workflow', '');

      switch (message.type) {
        case MessageType.PAUSE_WORKFLOW:
          actionResult = await this.pauseWorkflow(workflowId);
          break;
        case MessageType.RESUME_WORKFLOW:
          actionResult = await this.resumeWorkflow(workflowId);
          break;
        case MessageType.CANCEL_WORKFLOW:
          actionResult = await this.cancelWorkflow(workflowId);
          break;
      }

      const response = {
        workflowId,
        action,
        status: ResponseStatus.SUCCESS,
        result: actionResult,
      };

      await this.sendSuccessResponse(connection, message, response);

    } catch (error) {
      throw new IntegrationError(
        `Workflow control failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        IntegrationErrorCode.PROTOCOL_ERROR
      );
    }
  }

  private async handleHookRegisterMessage(
    connection: WebSocketConnection,
    message: RequestMessage<HookRegistration>
  ): Promise<void> {
    try {
      // Validate hook registration
      const hookRegistration = HookRegistrationSchema.parse(message.payload);

      // Register hook with hook manager
      await this.hookManager.registerHookFromRequest(hookRegistration, connection);

      const response = {
        hookName: hookRegistration.name,
        version: hookRegistration.version,
        status: ResponseStatus.REGISTERED,
        message: 'Hook registered successfully',
      };

      await this.sendSuccessResponse(connection, message, response);

    } catch (error) {
      throw new IntegrationError(
        `Hook registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        IntegrationErrorCode.HOOK_EXECUTION_FAILED
      );
    }
  }

  private async handleHookExecuteMessage(
    connection: WebSocketConnection,
    message: BaseMessage
  ): Promise<void> {
    try {
      const payload = (message as any).payload;
      const { hookName, input, version } = payload;

      if (!hookName) {
        throw new Error('Hook name is required');
      }

      // Create execution context
      const context = {
        hookName,
        executionId: uuidv4(),
        correlationId: message.correlationId || message.id,
        timestamp: new Date(),
        clientInfo: {
          sessionId: connection.sessionId,
          clientId: connection.clientId,
          version: connection.version,
        },
      };

      // Execute hook
      const hookResult = await this.hookManager.executeHook(hookName, input, context, version);

      const response = {
        hookName,
        executionId: context.executionId,
        success: hookResult.success,
        result: hookResult.result,
        error: hookResult.error,
        executionTime: hookResult.executionTime,
        version: hookResult.hookVersion,
      };

      await this.sendSuccessResponse(connection, message, response);

    } catch (error) {
      throw new IntegrationError(
        `Hook execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        IntegrationErrorCode.HOOK_EXECUTION_FAILED
      );
    }
  }

  private async handleHookResultMessage(
    connection: WebSocketConnection,
    message: BaseMessage
  ): Promise<void> {
    try {
      const payload = (message as any).payload;
      const { executionId, result, success } = payload;

      // Find pending request
      const pendingRequest = this.pendingRequests.get(executionId);
      if (pendingRequest) {
        // Clear timeout
        if (pendingRequest.timeout) {
          clearTimeout(pendingRequest.timeout);
        }

        // Remove from pending
        this.pendingRequests.delete(executionId);

        // Send result back to original requester
        const response = {
          executionId,
          success,
          result,
          completedAt: new Date().toISOString(),
        };

        await this.sendSuccessResponse(pendingRequest.connection, pendingRequest.message, response);
      }

      // Acknowledge receipt
      await this.sendSuccessResponse(connection, message, {
        executionId,
        status: ResponseStatus.ACKNOWLEDGED,
      });

    } catch (error) {
      throw new IntegrationError(
        `Hook result handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        IntegrationErrorCode.HOOK_EXECUTION_FAILED
      );
    }
  }

  // Workflow control methods

  private async pauseWorkflow(workflowId: string): Promise<any> {
    if (this.executionEngine) {
      await this.executionEngine.pauseExecution(workflowId);
      return { status: ResponseStatus.PAUSED, timestamp: new Date().toISOString() };
    }
    throw new Error('Execution engine not available');
  }

  private async resumeWorkflow(workflowId: string): Promise<any> {
    if (this.executionEngine) {
      await this.executionEngine.resumeExecution(workflowId);
      return { status: ResponseStatus.RESUMED, timestamp: new Date().toISOString() };
    }
    throw new Error('Execution engine not available');
  }

  private async cancelWorkflow(workflowId: string): Promise<any> {
    if (this.executionEngine) {
      await this.executionEngine.cancelExecution(workflowId);
      return { status: ResponseStatus.CANCELLED, timestamp: new Date().toISOString() };
    }
    throw new Error('Execution engine not available');
  }

  // Response helpers

  private async sendSuccessResponse<T>(
    connection: WebSocketConnection,
    originalMessage: BaseMessage,
    payload: T
  ): Promise<void> {
    const response: ResponseMessage<T> = {
      id: uuidv4(),
      type: originalMessage.type,
      timestamp: new Date(),
      correlationId: originalMessage.id,
      replyTo: originalMessage.id,
      payload,
      success: true,
    };

    await this.sendMessage(connection, response);
  }

  private async sendErrorResponse(
    connection: WebSocketConnection,
    originalMessage: BaseMessage,
    error: any
  ): Promise<void> {
    const integrationError = error instanceof IntegrationError
      ? error
      : new IntegrationError(
          error instanceof Error ? error.message : 'Unknown error',
          IntegrationErrorCode.PROTOCOL_ERROR
        );

    const response: ResponseMessage<null> = {
      id: uuidv4(),
      type: MessageType.ERROR,
      timestamp: new Date(),
      correlationId: originalMessage.correlationId || originalMessage.id,
      replyTo: originalMessage.id,
      payload: null,
      success: false,
      error: integrationError.message,
    };

    await this.sendMessage(connection, response);
  }

  private async sendMessage(connection: WebSocketConnection, message: BaseMessage): Promise<void> {
    // This would be implemented by the WebSocketServer
    // For now, we'll emit an event
    this.emitMessage('send_message', { connection, message });
  }

  // Request correlation management

  public trackRequest(
    connection: WebSocketConnection,
    message: BaseMessage,
    timeoutCallback?: () => void
  ): void {
    const timeout = setTimeout(() => {
      this.pendingRequests.delete(message.id);
      if (timeoutCallback) {
        timeoutCallback();
      }
    }, this.REQUEST_TIMEOUT);

    this.pendingRequests.set(message.id, {
      connection,
      message,
      timestamp: new Date(),
      timeout,
    });
  }

  public resolveRequest(messageId: string, result?: any): boolean {
    const pendingRequest = this.pendingRequests.get(messageId);
    if (pendingRequest) {
      if (pendingRequest.timeout) {
        clearTimeout(pendingRequest.timeout);
      }
      this.pendingRequests.delete(messageId);
      return true;
    }
    return false;
  }

  // Event emission for external listeners

  private emitMessage(event: string, data: any): void {
    // Use process.nextTick to avoid blocking
    process.nextTick(() => {
      if (typeof (global as any).messageHandler === 'object') {
        (global as any).messageHandler.emit(event, data);
      }
    });
  }

  // Utility methods

  public getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  public clearPendingRequests(): void {
    for (const [_, request] of this.pendingRequests) {
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
    }
    this.pendingRequests.clear();
  }

  public getMetrics() {
    return {
      pendingRequests: this.pendingRequests.size,
      oldestPendingRequest: this.getOldestPendingRequestAge(),
    };
  }

  private getOldestPendingRequestAge(): number {
    let oldest = 0;
    const now = Date.now();

    for (const [_, request] of this.pendingRequests) {
      const age = now - request.timestamp.getTime();
      if (age > oldest) {
        oldest = age;
      }
    }

    return oldest;
  }
}