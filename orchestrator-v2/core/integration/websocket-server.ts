import { EventEmitter } from 'events';
import { Server as HttpServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { Observable, Subject, merge } from 'rxjs';
import { takeUntil, tap } from 'rxjs/operators';

import {
  WebSocketServerConfig,
  WebSocketConnection,
  BaseMessage,
  RequestMessage,
  ResponseMessage,
  MessageType,
  ConnectRequest,
  IntegrationError,
  IntegrationErrorCode,
} from './types';
import { StreamingBridge } from './streaming-bridge';
import { HookManager } from './hook-manager';
import { ConnectionManager } from './connection-manager';
import { MessageRouter, MessageHandler, MessageMiddleware } from './message-router';
import { HeartbeatManager } from './heartbeat-manager';
import { MetricsCollector } from './metrics-collector';
import { MessageProtocolHandler } from './protocol-handler';

export interface WebSocketServerOptions {
  httpServer?: HttpServer;
  config: WebSocketServerConfig;
  streamingBridge: StreamingBridge;
  hookManager: HookManager;
}

export class IntegrationWebSocketServer extends EventEmitter {
  private server!: WebSocketServer;
  private config: WebSocketServerConfig;
  private streamingBridge: StreamingBridge;
  private hookManager: HookManager;
  private serverOptions!: WebSocket.ServerOptions;

  // Managers (initialized in start())
  private connectionManager!: ConnectionManager;
  private messageRouter!: MessageRouter;
  private heartbeatManager!: HeartbeatManager;
  private metricsCollector!: MetricsCollector;
  private protocolHandler!: MessageProtocolHandler;

  // Observable streams (initialized in start())
  private destroy$!: Subject<void>;

  // Public observables (initialized in start())
  public connections$!: Subject<WebSocketConnection>;
  public disconnections$!: Subject<string>;
  public messages$!: Subject<{ connection: WebSocketConnection; message: BaseMessage }>;
  public errors$!: Subject<{ connection?: WebSocketConnection; error: IntegrationError }>;

  // Server state
  private isRunning = false;

  constructor(options: WebSocketServerOptions) {
    super();

    this.config = options.config;
    this.streamingBridge = options.streamingBridge;
    this.hookManager = options.hookManager;

    // Store server options but don't create anything yet
    // Use either httpServer (if provided) or port, not both
    this.serverOptions = options.httpServer
      ? {
          server: options.httpServer,
          path: this.config.path,
          maxPayload: this.config.maxMessageSize,
          perMessageDeflate: this.config.compression,
        }
      : {
          port: this.config.port,
          host: this.config.host,
          path: this.config.path,
          maxPayload: this.config.maxMessageSize,
          perMessageDeflate: this.config.compression,
        } as WebSocket.ServerOptions;
  }

  private setupEventHandlers(): void {
    this.server.on('connection', async (socket: WebSocket, request: any) => {
      const connection = await this.connectionManager.handleConnection(socket, request);
      if (connection) {
        this.setupConnectionHandlers(connection);
        this.heartbeatManager.registerConnection(connection);
        this.metricsCollector.recordConnection('new');
      }
    });

    this.server.on('error', (error: Error) => {
      const integrationError: IntegrationError = {
        name: 'IntegrationError',
        message: `WebSocket server error: ${error.message}`,
        code: IntegrationErrorCode.SERVER_OVERLOADED,
        timestamp: new Date(),
      };
      this.metricsCollector.recordError(integrationError);
      this.emit('error', integrationError);
    });

    this.server.on('listening', () => {
      this.isRunning = true;
      this.heartbeatManager.start();
      this.metricsCollector.start();
      this.emit('listening', {
        port: this.config.port,
        host: this.config.host,
        path: this.config.path,
      });
    });
  }

  private setupObservableStreams(): void {
    // Monitor connection events
    this.connectionManager.connections$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (event.type === 'connected') {
          this.connections$.next(event.connection);
          this.emit('connection', event.connection);
        } else if (event.type === 'authenticated') {
          this.streamingBridge.addConnection(event.connection);
          this.metricsCollector.recordConnection('authenticated');
          this.connections$.next(event.connection);
          this.emit('authenticated', event.connection);
        } else if (event.type === 'disconnected') {
          this.streamingBridge.removeConnection(event.connection.id);
          this.heartbeatManager.unregisterConnection(event.connection.id);
          this.messageRouter.clearPendingRequests(event.connection.id);
          this.disconnections$.next(event.connection.id);
          this.emit('disconnection', { connection: event.connection, code: event.code, reason: event.reason });
        }
      });

    // Monitor message routing
    this.messageRouter.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        this.metricsCollector.recordMessage('received');
        this.messages$.next(message);
      });

    // Monitor errors
    this.messageRouter.errors$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => {
        this.errors$.next(error);
      });

    // Monitor connection manager errors
    this.connectionManager.errors$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => {
        this.errors$.next(error);
      });

    // Monitor responses
    this.messageRouter.responses$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ connection, response }) => {
        this.sendMessage(connection, response).catch(error => {
          console.error('Failed to send response:', error);
        });
      });

    // Monitor heartbeat events
    this.heartbeatManager.heartbeats$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        if (event.type === 'connection_stale') {
          const connection = this.connectionManager.getConnection(event.connectionId);
          if (connection) {
            this.connectionManager.disconnectConnection(
              event.connectionId,
              1001,
              'Heartbeat timeout'
            );
          }
        }
      });
  }

  private setupMessageHandlers(): void {
    // Register protocol handlers with the message router
    const connectHandler: MessageHandler = {
      canHandle: (message) => message.type === MessageType.CONNECT,
      handle: async (connection, message) => {
        await this.handleConnectMessage(connection, message as RequestMessage<ConnectRequest>);
      },
    };

    const pingHandler: MessageHandler = {
      canHandle: (message) => message.type === MessageType.PING,
      handle: async (connection, message) => {
        await this.sendPong(connection, message.id);
      },
    };

    const protocolHandlerWrapper: MessageHandler = {
      canHandle: (message) => [
        MessageType.SUBSCRIBE,
        MessageType.UNSUBSCRIBE,
        MessageType.EXECUTE_WORKFLOW,
        MessageType.PAUSE_WORKFLOW,
        MessageType.RESUME_WORKFLOW,
        MessageType.CANCEL_WORKFLOW,
        MessageType.HOOK_REGISTER,
        MessageType.HOOK_EXECUTE,
        MessageType.HOOK_RESULT,
      ].includes(message.type),
      handle: async (connection, message) => {
        await this.protocolHandler.handleMessage(connection, message);
      },
    };

    this.messageRouter.registerHandler(MessageType.CONNECT, connectHandler);
    this.messageRouter.registerHandler(MessageType.PING, pingHandler);

    // Register all protocol message types
    [
      MessageType.SUBSCRIBE,
      MessageType.UNSUBSCRIBE,
      MessageType.EXECUTE_WORKFLOW,
      MessageType.PAUSE_WORKFLOW,
      MessageType.RESUME_WORKFLOW,
      MessageType.CANCEL_WORKFLOW,
      MessageType.HOOK_REGISTER,
      MessageType.HOOK_EXECUTE,
      MessageType.HOOK_RESULT,
    ].forEach(type => {
      this.messageRouter.registerHandler(type, protocolHandlerWrapper);
    });
  }

  private setupConnectionHandlers(connection: WebSocketConnection): void {
    const { socket } = connection;

    socket.on('message', async (data: WebSocket.Data) => {
      try {
        this.connectionManager.updateActivity(connection.id);
        const message = this.parseMessage(data);

        await this.messageRouter.routeMessage(connection, message);
      } catch (error) {
        const integrationError: IntegrationError = {
          name: 'IntegrationError',
          message: `Message handling error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: IntegrationErrorCode.INVALID_MESSAGE,
          timestamp: new Date(),
        };

        this.metricsCollector.recordError(integrationError);
        this.metricsCollector.recordMessage('dropped');

        // Send error response if possible
        if (connection.socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            id: uuidv4(),
            type: MessageType.ERROR,
            timestamp: new Date(),
            error: integrationError.message,
            success: false,
          }));
        }
      }
    });
  }

  private parseMessage(data: WebSocket.Data): BaseMessage {
    try {
      const text = data.toString();
      const parsed = JSON.parse(text);

      if (!parsed.id || !parsed.type || !parsed.timestamp) {
        throw new Error('Invalid message format - missing required fields');
      }

      return {
        ...parsed,
        timestamp: new Date(parsed.timestamp),
      };
    } catch (error) {
      throw new Error(`Failed to parse message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async handleConnectMessage(
    connection: WebSocketConnection,
    message: RequestMessage<ConnectRequest>
  ): Promise<void> {
    try {
      const response = await this.connectionManager.authenticateConnection(
        connection,
        message.payload
      );

      await this.messageRouter.sendResponse(connection, message, response, true);
      this.emit('authenticated', connection);
    } catch (error) {
      this.metricsCollector.recordConnection('failed');
      await this.messageRouter.sendErrorResponse(connection, message, error);

      // Close the connection after failed authentication
      setTimeout(() => {
        this.connectionManager.disconnectConnection(
          connection.id,
          1008,
          'Authentication failed'
        );
      }, 1000);
    }
  }

  private async sendPong(connection: WebSocketConnection, pingId: string): Promise<void> {
    const pong: BaseMessage = {
      id: uuidv4(),
      type: MessageType.PONG,
      timestamp: new Date(),
      correlationId: pingId,
    };

    await this.sendMessage(connection, pong);
  }

  public async sendMessage(connection: WebSocketConnection, message: BaseMessage): Promise<void> {
    try {
      if (!connection.socket || connection.socket.readyState !== WebSocket.OPEN) {
        throw new Error('Connection is not open');
      }

      const serialized = JSON.stringify(message);
      const messageSize = Buffer.byteLength(serialized);

      connection.socket.send(serialized);

      this.metricsCollector.recordMessage('sent', messageSize);
      this.emit('message_sent', { connection, message });
    } catch (error) {
      const integrationError: IntegrationError = {
        name: 'IntegrationError',
        message: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        code: IntegrationErrorCode.CONNECTION_FAILED,
        timestamp: new Date(),
      };

      this.metricsCollector.recordError(integrationError);
      throw error;
    }
  }

  public async broadcast(message: BaseMessage, filter?: (connection: WebSocketConnection) => boolean): Promise<void> {
    const connections = this.connectionManager.getConnections();
    const targets = filter ? connections.filter(filter) : connections;

    const results = await Promise.allSettled(
      targets.map(connection => this.sendMessage(connection, message))
    );

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Failed to broadcast to connection ${targets[index].id}:`, result.reason);
        this.metricsCollector.recordMessage('dropped');
      }
    });
  }


  // Public API methods

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        resolve();
        return;
      }

      // Port 0 is valid - it means let the system choose
      if (this.config.port === undefined || this.config.port === null || this.config.port < 0) {
        reject(new Error('Invalid port specified'));
        return;
      }

      // Initialize managers (moved from constructor)
      this.connectionManager = new ConnectionManager({ config: this.config });
      this.messageRouter = new MessageRouter({
        messageTimeout: this.config.messageTimeout,
        enableCorrelation: true,
      });
      this.heartbeatManager = new HeartbeatManager({
        interval: this.config.heartbeatInterval,
        timeout: this.config.heartbeatInterval * 2,
      });
      this.metricsCollector = new MetricsCollector();

      this.protocolHandler = new MessageProtocolHandler(this.hookManager, {
        executionEngine: this.streamingBridge['executionEngine'],
        stateManager: this.streamingBridge['stateManager'],
      });

      // Initialize observables
      this.destroy$ = new Subject<void>();
      this.connections$ = new Subject<WebSocketConnection>();
      this.disconnections$ = new Subject<string>();
      this.messages$ = new Subject<{ connection: WebSocketConnection; message: BaseMessage }>();
      this.errors$ = new Subject<{ connection?: WebSocketConnection; error: IntegrationError }>();

      // Create the WebSocket server
      this.server = new WebSocketServer(this.serverOptions);

      // Set up event handlers
      this.setupEventHandlers();
      this.setupMessageHandlers();
      this.setupObservableStreams();

      // If we have a specific port (including 0 for auto-assign), we need to wait for 'listening'
      // The 'listening' event handler is already set up in setupEventHandlers()
      // Add a one-time listener to resolve this promise
      this.server.once('listening', () => {
        // Mark as running (this is also done in the regular 'listening' handler)
        this.isRunning = true;
        resolve();
      });

      // Handle error during startup
      this.server.once('error', (error) => {
        reject(error);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isRunning) {
        resolve();
        return;
      }

      this.isRunning = false;

      // Stop managers if they exist
      if (this.heartbeatManager) {
        this.heartbeatManager.stop();
      }
      if (this.metricsCollector) {
        this.metricsCollector.stop();
      }

      // Close all connections if connection manager exists
      if (this.connectionManager) {
        const connections = this.connectionManager.getConnections();
        connections.forEach(connection => {
          this.connectionManager.disconnectConnection(
            connection.id,
            1001,
            'Server shutting down'
          );
        });
        this.connectionManager.shutdown();
      }

      // Shutdown message router if it exists
      if (this.messageRouter) {
        this.messageRouter.shutdown();
      }

      // Complete observables if they exist
      if (this.destroy$) {
        this.destroy$.next();
        this.destroy$.complete();
      }
      if (this.connections$) {
        this.connections$.complete();
      }
      if (this.disconnections$) {
        this.disconnections$.complete();
      }
      if (this.messages$) {
        this.messages$.complete();
      }
      if (this.errors$) {
        this.errors$.complete();
      }

      // Close server if it exists
      if (this.server) {
        this.server.close(() => {
          this.emit('stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getConnection(connectionId: string): WebSocketConnection | undefined {
    return this.connectionManager.getConnection(connectionId);
  }

  public getConnections(): WebSocketConnection[] {
    return this.connectionManager.getConnections();
  }

  public getConnectionCount(): number {
    return this.connectionManager.getConnectionCount();
  }

  public getMetrics() {
    return {
      server: this.metricsCollector.getMetrics(),
      connections: this.connectionManager.getMetrics(),
      messages: this.messageRouter.getMetrics(),
      heartbeat: this.heartbeatManager.getMetrics(),
    };
  }

  public isConnectionActive(connectionId: string): boolean {
    return this.connectionManager.isConnectionActive(connectionId);
  }

  // Getter for testing - exposes the underlying WebSocketServer
  public get wsServer(): WebSocketServer {
    return this.server;
  }
}