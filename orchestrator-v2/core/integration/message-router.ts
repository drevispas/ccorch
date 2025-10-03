import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { filter, map, tap, catchError, timeout } from 'rxjs/operators';

import {
  WebSocketConnection,
  BaseMessage,
  RequestMessage,
  ResponseMessage,
  MessageType,
  IntegrationError,
  IntegrationErrorCode,
} from './types';

export interface MessageHandler {
  canHandle(message: BaseMessage): boolean;
  handle(connection: WebSocketConnection, message: BaseMessage): Promise<void>;
}

export interface MessageMiddleware {
  process(
    connection: WebSocketConnection,
    message: BaseMessage,
    next: () => Promise<void>
  ): Promise<void>;
}

export interface RouterConfig {
  messageTimeout?: number;
  maxPendingRequests?: number;
  enableCorrelation?: boolean;
}

export interface PendingRequest {
  connection: WebSocketConnection;
  message: BaseMessage;
  timestamp: Date;
  timeout?: NodeJS.Timeout;
  resolver?: (response: ResponseMessage<any>) => void;
  rejector?: (error: Error) => void;
}

export class MessageRouter extends EventEmitter {
  private handlers: Map<MessageType, MessageHandler[]> = new Map();
  private middleware: MessageMiddleware[] = [];
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private config: RouterConfig;

  // Observable streams
  private messageSubject = new Subject<{ connection: WebSocketConnection; message: BaseMessage }>();
  private responseSubject = new Subject<{ connection: WebSocketConnection; response: ResponseMessage<any> }>();
  private errorSubject = new Subject<{ connection: WebSocketConnection; error: IntegrationError; message?: BaseMessage }>();

  public messages$ = this.messageSubject.asObservable();
  public responses$ = this.responseSubject.asObservable();
  public errors$ = this.errorSubject.asObservable();

  // Metrics
  private metrics = {
    messagesRouted: 0,
    messagesDropped: 0,
    averageProcessingTime: 0,
    pendingRequests: 0,
    timeouts: 0,
  };

  constructor(config: RouterConfig = {}) {
    super();
    this.config = {
      messageTimeout: config.messageTimeout || 30000,
      maxPendingRequests: config.maxPendingRequests || 1000,
      enableCorrelation: config.enableCorrelation !== false,
    };
  }

  /**
   * Register a handler for a specific message type
   */
  public registerHandler(messageType: MessageType, handler: MessageHandler): void {
    if (!this.handlers.has(messageType)) {
      this.handlers.set(messageType, []);
    }
    this.handlers.get(messageType)!.push(handler);
  }

  /**
   * Register multiple handlers at once
   */
  public registerHandlers(handlers: Map<MessageType, MessageHandler>): void {
    handlers.forEach((handler, messageType) => {
      this.registerHandler(messageType, handler);
    });
  }

  /**
   * Add middleware to the processing pipeline
   */
  public use(middleware: MessageMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Route a message to appropriate handlers
   */
  public async routeMessage(connection: WebSocketConnection, message: BaseMessage): Promise<void> {
    const startTime = Date.now();

    try {
      // Emit message event
      this.messageSubject.next({ connection, message });

      // Check for response to pending request
      if (this.config.enableCorrelation && this.isResponse(message)) {
        this.handleResponse(connection, message as ResponseMessage<any>);
        return;
      }

      // Process through middleware chain
      await this.processMiddleware(connection, message, async () => {
        // Find and execute handlers
        const handlers = this.getHandlers(message);
        if (handlers.length === 0) {
          throw new IntegrationError(
            `No handler found for message type: ${message.type}`,
            IntegrationErrorCode.INVALID_MESSAGE
          );
        }

        // Execute all matching handlers
        await Promise.all(
          handlers.map(handler => handler.handle(connection, message))
        );
      });

      // Track request if expecting response
      if (this.config.enableCorrelation && this.isRequest(message)) {
        this.trackRequest(connection, message);
      }

      // Update metrics
      this.metrics.messagesRouted++;
      const processingTime = Date.now() - startTime;
      this.updateAverageProcessingTime(processingTime);

    } catch (error) {
      this.metrics.messagesDropped++;
      const integrationError = this.normalizeError(error);

      this.errorSubject.next({ connection, error: integrationError, message });
      throw integrationError;
    }
  }

  /**
   * Send a response message
   */
  public async sendResponse<T>(
    connection: WebSocketConnection,
    originalMessage: BaseMessage,
    payload: T,
    success: boolean = true
  ): Promise<ResponseMessage<T>> {
    const response: ResponseMessage<T> = {
      id: uuidv4(),
      type: originalMessage.type,
      timestamp: new Date(),
      correlationId: originalMessage.id,
      replyTo: originalMessage.id,
      payload,
      success,
    };

    this.responseSubject.next({ connection, response });
    return response;
  }

  /**
   * Send an error response
   */
  public async sendErrorResponse(
    connection: WebSocketConnection,
    originalMessage: BaseMessage,
    error: any
  ): Promise<ResponseMessage<null>> {
    const integrationError = this.normalizeError(error);

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

    this.responseSubject.next({ connection, response });
    this.errorSubject.next({ connection, error: integrationError, message: originalMessage });

    return response;
  }

  /**
   * Wait for a response to a request
   */
  public waitForResponse<T>(
    connection: WebSocketConnection,
    request: RequestMessage<any>,
    timeoutMs?: number
  ): Promise<ResponseMessage<T>> {
    return new Promise((resolve, reject) => {
      const requestTimeout = timeoutMs || this.config.messageTimeout!;

      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        this.metrics.timeouts++;
        reject(new IntegrationError(
          `Request timeout after ${requestTimeout}ms`,
          IntegrationErrorCode.MESSAGE_TIMEOUT
        ));
      }, requestTimeout);

      this.pendingRequests.set(request.id, {
        connection,
        message: request,
        timestamp: new Date(),
        timeout: timeoutHandle,
        resolver: resolve,
        rejector: reject,
      });

      this.metrics.pendingRequests = this.pendingRequests.size;
    });
  }

  /**
   * Clear pending requests for a connection
   */
  public clearPendingRequests(connectionId: string): void {
    const toDelete: string[] = [];

    this.pendingRequests.forEach((pending, requestId) => {
      if (pending.connection.id === connectionId) {
        if (pending.timeout) {
          clearTimeout(pending.timeout);
        }
        if (pending.rejector) {
          pending.rejector(new IntegrationError(
            'Connection closed',
            IntegrationErrorCode.CONNECTION_FAILED
          ));
        }
        toDelete.push(requestId);
      }
    });

    toDelete.forEach(id => this.pendingRequests.delete(id));
    this.metrics.pendingRequests = this.pendingRequests.size;
  }

  /**
   * Get metrics
   */
  public getMetrics() {
    return {
      ...this.metrics,
      handlerCount: this.getTotalHandlerCount(),
      middlewareCount: this.middleware.length,
    };
  }

  /**
   * Shutdown the router
   */
  public shutdown(): void {
    // Clear all pending requests
    this.pendingRequests.forEach((pending, requestId) => {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      if (pending.rejector) {
        pending.rejector(new IntegrationError(
          'Router shutting down',
          IntegrationErrorCode.SERVER_OVERLOADED
        ));
      }
    });
    this.pendingRequests.clear();

    // Complete observables
    this.messageSubject.complete();
    this.responseSubject.complete();
    this.errorSubject.complete();

    // Clear handlers and middleware
    this.handlers.clear();
    this.middleware = [];

    this.removeAllListeners();
  }

  // Private methods

  private getHandlers(message: BaseMessage): MessageHandler[] {
    const typeHandlers = this.handlers.get(message.type) || [];
    return typeHandlers.filter(handler => handler.canHandle(message));
  }

  private async processMiddleware(
    connection: WebSocketConnection,
    message: BaseMessage,
    finalHandler: () => Promise<void>
  ): Promise<void> {
    let index = 0;

    const next = async (): Promise<void> => {
      if (index >= this.middleware.length) {
        return finalHandler();
      }

      const middleware = this.middleware[index++];
      return middleware.process(connection, message, next);
    };

    return next();
  }

  private isRequest(message: BaseMessage): boolean {
    // Messages that typically expect responses
    const requestTypes = [
      MessageType.CONNECT,
      MessageType.SUBSCRIBE,
      MessageType.UNSUBSCRIBE,
      MessageType.EXECUTE_WORKFLOW,
      MessageType.PAUSE_WORKFLOW,
      MessageType.RESUME_WORKFLOW,
      MessageType.CANCEL_WORKFLOW,
      MessageType.HOOK_REGISTER,
      MessageType.HOOK_EXECUTE,
    ];

    return requestTypes.includes(message.type);
  }

  private isResponse(message: BaseMessage): boolean {
    // Check if message has response characteristics
    return !!(message as any).replyTo || !!(message as any).correlationId;
  }

  private handleResponse(connection: WebSocketConnection, response: ResponseMessage<any>): void {
    const correlationId = response.replyTo || response.correlationId;
    if (!correlationId) return;

    const pending = this.pendingRequests.get(correlationId);
    if (pending) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }

      this.pendingRequests.delete(correlationId);
      this.metrics.pendingRequests = this.pendingRequests.size;

      if (pending.resolver) {
        pending.resolver(response);
      }
    }
  }

  private trackRequest(connection: WebSocketConnection, message: BaseMessage): void {
    if (this.pendingRequests.size >= this.config.maxPendingRequests!) {
      // Remove oldest request
      const oldestKey = this.pendingRequests.keys().next().value;
      if (oldestKey !== undefined) {
        const oldest = this.pendingRequests.get(oldestKey);
        if (oldest) {
          if (oldest.timeout) {
            clearTimeout(oldest.timeout);
          }
          if (oldest.rejector) {
            oldest.rejector(new IntegrationError(
              'Request queue full',
              IntegrationErrorCode.SERVER_OVERLOADED
            ));
          }
          this.pendingRequests.delete(oldestKey);
        }
      }
    }

    const timeout = setTimeout(() => {
      this.pendingRequests.delete(message.id);
      this.metrics.timeouts++;
      this.metrics.pendingRequests = this.pendingRequests.size;
    }, this.config.messageTimeout!);

    this.pendingRequests.set(message.id, {
      connection,
      message,
      timestamp: new Date(),
      timeout,
    });

    this.metrics.pendingRequests = this.pendingRequests.size;
  }

  private normalizeError(error: any): IntegrationError {
    if (error instanceof IntegrationError) {
      return error;
    }

    return new IntegrationError(
      error instanceof Error ? error.message : 'Unknown error',
      IntegrationErrorCode.PROTOCOL_ERROR
    );
  }

  private updateAverageProcessingTime(processingTime: number): void {
    const currentAvg = this.metrics.averageProcessingTime;
    const totalMessages = this.metrics.messagesRouted;

    this.metrics.averageProcessingTime =
      (currentAvg * (totalMessages - 1) + processingTime) / totalMessages;
  }

  private getTotalHandlerCount(): number {
    let count = 0;
    this.handlers.forEach(handlers => {
      count += handlers.length;
    });
    return count;
  }
}