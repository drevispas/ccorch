import { EventEmitter } from 'events';
import { Server as HttpServer } from 'http';
import { Observable, BehaviorSubject, merge } from 'rxjs';
import { map, filter, tap, share } from 'rxjs/operators';

import {
  IntegrationLayerConfig,
  WebSocketConnection,
  IntegrationStatus,
  IntegrationError,
  IntegrationErrorCode,
} from './types';

import { IntegrationWebSocketServer } from './websocket-server';
import { StreamingBridge } from './streaming-bridge';
import { HookManager } from './hook-manager';
import { MessageProtocolHandler } from './protocol-handler';

import { ReactiveExecutionEngine } from '../execution/reactive-execution-engine';
import { EventDrivenStateManager } from '../state/event-driven-state-manager';

export interface IntegrationLayerDependencies {
  executionEngine: ReactiveExecutionEngine;
  stateManager: EventDrivenStateManager;
  httpServer?: HttpServer;
}

export interface IntegrationLayerMetrics {
  status: IntegrationStatus;
  uptime: number;
  connections: {
    total: number;
    active: number;
    authenticated: number;
  };
  streams: {
    total: number;
    active: number;
    subscriptions: number;
  };
  hooks: {
    registered: number;
    executions: number;
    successRate: number;
  };
  messages: {
    received: number;
    sent: number;
    errors: number;
  };
  performance: {
    averageLatency: number;
    throughput: number;
    errorRate: number;
  };
}

export class IntegrationLayer extends EventEmitter {
  private config: IntegrationLayerConfig;
  private dependencies: IntegrationLayerDependencies;

  // Core components
  private webSocketServer!: IntegrationWebSocketServer;
  private streamingBridge!: StreamingBridge;
  private hookManager!: HookManager;
  private protocolHandler!: MessageProtocolHandler;

  // State management
  private statusSubject = new BehaviorSubject<IntegrationStatus>(IntegrationStatus.STOPPED);
  private startTime?: Date;
  private isInitialized = false;

  // Metrics
  private metrics: IntegrationLayerMetrics = {
    status: IntegrationStatus.STOPPED,
    uptime: 0,
    connections: { total: 0, active: 0, authenticated: 0 },
    streams: { total: 0, active: 0, subscriptions: 0 },
    hooks: { registered: 0, executions: 0, successRate: 0 },
    messages: { received: 0, sent: 0, errors: 0 },
    performance: { averageLatency: 0, throughput: 0, errorRate: 0 },
  };

  constructor(config: IntegrationLayerConfig, dependencies: IntegrationLayerDependencies) {
    super();

    this.config = config;
    this.dependencies = dependencies;

    this.initializeComponents();
    this.setupEventHandlers();
  }

  private initializeComponents(): void {
    // Initialize hook manager
    this.hookManager = new HookManager(this.config.hooks);

    // Initialize streaming bridge
    this.streamingBridge = new StreamingBridge(
      this.dependencies.executionEngine,
      this.dependencies.stateManager,
      this.config.streaming
    );

    // Initialize protocol handler
    this.protocolHandler = new MessageProtocolHandler(this.hookManager, {
      executionEngine: this.dependencies.executionEngine,
      stateManager: this.dependencies.stateManager,
    });

    // Initialize WebSocket server
    this.webSocketServer = new IntegrationWebSocketServer({
      httpServer: this.dependencies.httpServer,
      config: this.config.websocket,
      streamingBridge: this.streamingBridge,
      hookManager: this.hookManager,
    });
  }

  private setupEventHandlers(): void {
    // WebSocket Server events
    this.webSocketServer.on('connection', (connection: WebSocketConnection) => {
      this.handleNewConnection(connection);
    });

    this.webSocketServer.on('disconnection', ({ connection }: any) => {
      this.handleDisconnection(connection);
    });

    this.webSocketServer.on('message_sent', ({ connection, message }: any) => {
      this.metrics.messages.sent++;
      this.emit('message_sent', { connection, message });
    });

    this.webSocketServer.on('connection_error', ({ connection, error }: any) => {
      this.handleConnectionError(connection, error);
    });

    this.webSocketServer.on('metrics', (serverMetrics: any) => {
      this.updateMetricsFromServer(serverMetrics);
    });

    // Streaming Bridge events
    this.streamingBridge.on('stream_created', (stream: any) => {
      this.metrics.streams.total++;
      this.emit('stream_created', stream);
    });

    this.streamingBridge.on('subscription_created', ({ connectionId, subscription }: any) => {
      this.metrics.streams.subscriptions++;
      this.emit('subscription_created', { connectionId, subscription });
    });

    this.streamingBridge.on('stream_error', ({ streamId, connectionId, error }: any) => {
      this.handleStreamError(streamId, connectionId, error);
    });

    this.streamingBridge.on('send_message', ({ connection, message }: any) => {
      this.webSocketServer.sendMessage(connection, message);
    });

    // Hook Manager events
    this.hookManager.on('hook_registered', ({ name, version }: any) => {
      this.metrics.hooks.registered++;
      this.emit('hook_registered', { name, version });
    });

    this.hookManager.on('hook_executed', (result: any) => {
      this.metrics.hooks.executions++;
      this.updateHookSuccessRate(result.success);
      this.emit('hook_executed', result);
    });

    this.hookManager.on('hook_error', ({ hookName, error }: any) => {
      this.handleHookError(hookName, error);
    });

    // Protocol Handler events
    this.setupProtocolHandlerEvents();

    // Status changes
    this.statusSubject.subscribe((status) => {
      this.metrics.status = status;
      this.emit('status_changed', status);
    });
  }

  private setupProtocolHandlerEvents(): void {
    // Set up global message handler for protocol handler events
    if (!(global as any).messageHandler) {
      (global as any).messageHandler = new EventEmitter();
    }

    const messageHandler = (global as any).messageHandler;

    messageHandler.on('subscription_request', async ({ connection, subscribeRequest, messageId }: any) => {
      try {
        const subscriptionId = await this.streamingBridge.createSubscription(
          connection.id,
          subscribeRequest
        );
        this.emit('subscription_created', { connection, subscriptionId, subscribeRequest });
      } catch (error) {
        this.emit('subscription_error', { connection, error, messageId });
      }
    });

    messageHandler.on('unsubscription_request', ({ connection, subscriptionId }: any) => {
      // Handle unsubscription logic
      this.emit('unsubscription', { connection, subscriptionId });
    });

    messageHandler.on('workflow_execution_request', async ({ connection, workflowRequest, workflowId }: any) => {
      try {
        // Execute workflow using execution engine
        if (this.dependencies.executionEngine) {
          // This would trigger the actual workflow execution
          // For now, we'll emit an event
          this.emit('workflow_execution_started', { connection, workflowRequest, workflowId });
        }
      } catch (error) {
        this.emit('workflow_execution_error', { connection, workflowRequest, error });
      }
    });

    messageHandler.on('send_message', ({ connection, message }: any) => {
      this.webSocketServer.sendMessage(connection, message);
    });
  }

  private setupObservables(): void {
    // Create combined observables for monitoring
    const connections$ = this.webSocketServer.connections$.pipe(
      tap(() => this.updateConnectionMetrics()),
      share()
    );

    const disconnections$ = this.webSocketServer.disconnections$.pipe(
      tap(() => this.updateConnectionMetrics()),
      share()
    );

    const messages$ = this.webSocketServer.messages$.pipe(
      tap(() => this.metrics.messages.received++),
      share()
    );

    const errors$ = merge(
      this.webSocketServer.errors$,
      this.streamingBridge.errors$ || new Observable(() => {}),
      this.hookManager.hookError$
    ).pipe(
      tap(() => this.metrics.messages.errors++),
      share()
    );

    // Subscribe to combined streams
    merge(connections$, disconnections$, messages$, errors$).subscribe();
  }

  // Event handlers

  private handleNewConnection(connection: WebSocketConnection): void {
    this.metrics.connections.total++;
    if (connection.isAuthenticated) {
      this.metrics.connections.authenticated++;
    }
    this.updateConnectionMetrics();
    this.emit('connection', connection);
  }

  private handleDisconnection(connection: WebSocketConnection): void {
    if (connection.isAuthenticated) {
      this.metrics.connections.authenticated--;
    }
    this.updateConnectionMetrics();
    this.emit('disconnection', connection);
  }

  private handleConnectionError(connection: WebSocketConnection, error: IntegrationError): void {
    this.metrics.messages.errors++;
    this.emit('connection_error', { connection, error });
  }

  private handleStreamError(streamId: string, connectionId: string, error: IntegrationError): void {
    this.metrics.messages.errors++;
    this.emit('stream_error', { streamId, connectionId, error });
  }

  private handleHookError(hookName: string, error: IntegrationError): void {
    this.metrics.messages.errors++;
    this.emit('hook_error', { hookName, error });
  }

  // Metrics updates

  private updateConnectionMetrics(): void {
    this.metrics.connections.active = this.webSocketServer.getConnectionCount();
  }

  private updateMetricsFromServer(serverMetrics: any): void {
    this.metrics.uptime = serverMetrics.uptime;
    this.metrics.performance.throughput = serverMetrics.messagesSent + serverMetrics.messagesReceived;
  }

  private updateHookSuccessRate(success: boolean): void {
    const totalExecutions = this.metrics.hooks.executions;
    const currentSuccessRate = this.metrics.hooks.successRate;

    if (success) {
      this.metrics.hooks.successRate =
        (currentSuccessRate * (totalExecutions - 1) + 1) / totalExecutions;
    } else {
      this.metrics.hooks.successRate =
        (currentSuccessRate * (totalExecutions - 1)) / totalExecutions;
    }
  }

  // Public API

  public async start(): Promise<void> {
    try {
      if (this.statusSubject.value !== IntegrationStatus.STOPPED) {
        throw new Error('Integration layer is not in stopped state');
      }

      this.statusSubject.next(IntegrationStatus.STARTING);
      this.emit('starting');

      // Start WebSocket server
      await this.webSocketServer.start();

      // Set up observables after WebSocket server has started
      this.setupObservables();

      // Mark as started
      this.startTime = new Date();
      this.isInitialized = true;
      this.statusSubject.next(IntegrationStatus.RUNNING);

      this.emit('started');

    } catch (error) {
      this.statusSubject.next(IntegrationStatus.ERROR);
      const integrationError: IntegrationError = {
        name: 'IntegrationError',
        message: `Failed to start integration layer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        code: IntegrationErrorCode.SERVER_OVERLOADED,
        timestamp: new Date(),
      };
      this.emit('error', integrationError);
      throw integrationError;
    }
  }

  public async stop(): Promise<void> {
    try {
      if (this.statusSubject.value !== IntegrationStatus.RUNNING) {
        return;
      }

      this.statusSubject.next(IntegrationStatus.STOPPING);
      this.emit('stopping');

      // Stop WebSocket server
      await this.webSocketServer.stop();

      // Clean up protocol handler
      this.protocolHandler.clearPendingRequests();

      // Mark as stopped
      this.isInitialized = false;
      this.statusSubject.next(IntegrationStatus.STOPPED);

      this.emit('stopped');

    } catch (error) {
      this.statusSubject.next(IntegrationStatus.ERROR);
      const integrationError: IntegrationError = {
        name: 'IntegrationError',
        message: `Failed to stop integration layer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        code: IntegrationErrorCode.SERVER_OVERLOADED,
        timestamp: new Date(),
      };
      this.emit('error', integrationError);
      throw integrationError;
    }
  }

  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  // Status and metrics

  public getStatus(): IntegrationStatus {
    return this.statusSubject.value;
  }

  public isRunning(): boolean {
    return this.statusSubject.value === IntegrationStatus.RUNNING;
  }

  public getMetrics(): IntegrationLayerMetrics {
    // Update real-time metrics
    if (this.startTime) {
      this.metrics.uptime = Date.now() - this.startTime.getTime();
    }

    this.metrics.streams = {
      ...this.metrics.streams,
      ...this.streamingBridge.getMetrics(),
    };

    this.metrics.hooks = {
      ...this.metrics.hooks,
      ...this.hookManager.getMetrics(),
    };

    // Calculate error rate
    const totalMessages = this.metrics.messages.received + this.metrics.messages.sent;
    this.metrics.performance.errorRate = totalMessages > 0
      ? (this.metrics.messages.errors / totalMessages) * 100
      : 0;

    return { ...this.metrics };
  }

  // Component access

  public getWebSocketServer(): IntegrationWebSocketServer {
    return this.webSocketServer;
  }

  public getStreamingBridge(): StreamingBridge {
    return this.streamingBridge;
  }

  public getHookManager(): HookManager {
    return this.hookManager;
  }

  public getProtocolHandler(): MessageProtocolHandler {
    return this.protocolHandler;
  }

  // Connection management

  public getConnections(): WebSocketConnection[] {
    return this.webSocketServer.getConnections();
  }

  public getConnection(connectionId: string): WebSocketConnection | undefined {
    return this.webSocketServer.getConnection(connectionId);
  }

  public async broadcastMessage(message: any, filter?: (connection: WebSocketConnection) => boolean): Promise<void> {
    await this.webSocketServer.broadcast(message, filter);
  }

  // Observable streams

  public get status$(): Observable<IntegrationStatus> {
    return this.statusSubject.asObservable();
  }

  public get connections$(): Observable<WebSocketConnection> {
    return this.webSocketServer.connections$;
  }

  public get messages$(): Observable<any> {
    return this.webSocketServer.messages$;
  }

  public get errors$(): Observable<any> {
    return this.webSocketServer.errors$;
  }
}