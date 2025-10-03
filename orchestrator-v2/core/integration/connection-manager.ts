import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { Observable, Subject, fromEvent, merge } from 'rxjs';
import { map, filter, takeUntil, tap, catchError } from 'rxjs/operators';

import {
  WebSocketConnection,
  WebSocketServerConfig,
  ConnectRequest,
  ConnectedResponse,
  IntegrationError,
  IntegrationErrorCode,
  ConnectRequestSchema,
} from './types';
import { AuthenticationService, AuthToken } from './auth';

export interface ConnectionManagerOptions {
  config: WebSocketServerConfig;
  authService?: AuthenticationService;
}

export interface ConnectionEvent {
  type: 'connected' | 'authenticated' | 'disconnected' | 'error';
  connection: WebSocketConnection;
  error?: IntegrationError;
  code?: number;
  reason?: string;
}

export class ConnectionManager extends EventEmitter {
  private connections: Map<string, WebSocketConnection> = new Map();
  private authService: AuthenticationService;
  private config: WebSocketServerConfig;

  // Observable streams
  private connectionSubject = new Subject<ConnectionEvent>();
  private errorSubject = new Subject<{ connection: WebSocketConnection; error: IntegrationError }>();
  private destroy$ = new Subject<void>();

  public connections$ = this.connectionSubject.asObservable();
  public errors$ = this.errorSubject.asObservable();

  // Metrics
  private metrics = {
    totalConnections: 0,
    activeConnections: 0,
    failedAuthentications: 0,
    connectionDuration: new Map<string, number>(),
  };

  constructor(options: ConnectionManagerOptions) {
    super();
    this.config = options.config;
    this.authService = options.authService || new AuthenticationService();
  }

  /**
   * Handle a new WebSocket connection
   */
  public async handleConnection(socket: WebSocket, request: any): Promise<WebSocketConnection | null> {
    const connectionId = uuidv4();

    // Check connection limits
    if (this.connections.size >= this.config.maxConnections) {
      socket.close(1013, 'Server at capacity');
      return null;
    }

    // Create connection object
    const connection: WebSocketConnection = {
      id: connectionId,
      socket,
      sessionId: '',
      clientId: '',
      version: '',
      capabilities: [],
      connectedAt: new Date(),
      lastActivity: new Date(),
      subscriptions: new Map(),
      isAuthenticated: false,
      metadata: {
        remoteAddress: request.socket.remoteAddress,
        userAgent: request.headers['user-agent'],
      },
    };

    // Add to connections map
    this.connections.set(connectionId, connection);
    this.metrics.totalConnections++;
    this.metrics.activeConnections = this.connections.size;
    this.metrics.connectionDuration.set(connectionId, Date.now());

    // Setup socket event handlers
    this.setupSocketHandlers(connection);

    // Emit connection event
    this.connectionSubject.next({
      type: 'connected',
      connection,
    });

    this.emit('connection', connection);

    // Set authentication timeout
    this.setAuthenticationTimeout(connection);

    return connection;
  }

  /**
   * Authenticate a connection with provided credentials
   */
  public async authenticateConnection(
    connection: WebSocketConnection,
    connectRequest: ConnectRequest
  ): Promise<ConnectedResponse> {
    try {
      // Validate connection request
      const validatedRequest = ConnectRequestSchema.parse(connectRequest);

      // Authenticate the client
      const authToken = await this.authenticateClient(validatedRequest);

      // Generate session ID
      const sessionId = uuidv4();

      // Update connection
      connection.sessionId = sessionId;
      connection.clientId = validatedRequest.clientId;
      connection.version = validatedRequest.version;
      connection.capabilities = validatedRequest.capabilities;
      connection.isAuthenticated = true;
      connection.authToken = authToken;

      // Clear authentication timeout
      if ((connection as any).authTimeout) {
        clearTimeout((connection as any).authTimeout);
        delete (connection as any).authTimeout;
      }

      // Prepare response
      const response: ConnectedResponse = {
        sessionId,
        serverVersion: '2.0.0',
        supportedFeatures: [
          'workflow_streaming',
          'hook_system',
          'real_time_metrics',
          'bidirectional_control',
        ],
        serverCapabilities: {
          maxConcurrentWorkflows: 10,
          maxStreamsPerConnection: this.config.maxStreamsPerConnection,
          supportedHookVersions: ['1.0.0', '2.0.0'],
        },
        connectionConfig: {
          heartbeatInterval: this.config.heartbeatInterval,
          maxMessageSize: this.config.maxMessageSize,
          compressionEnabled: this.config.compression,
        },
      };

      // Emit authentication event
      this.connectionSubject.next({
        type: 'authenticated',
        connection,
      });

      this.emit('authenticated', connection);

      return response;
    } catch (error) {
      this.metrics.failedAuthentications++;

      const integrationError = new IntegrationError(
        `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        IntegrationErrorCode.AUTHENTICATION_FAILED
      );

      this.errorSubject.next({ connection, error: integrationError });
      throw integrationError;
    }
  }

  /**
   * Disconnect a connection
   */
  public disconnectConnection(connectionId: string, code?: number, reason?: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Clear any timeouts
    if ((connection as any).authTimeout) {
      clearTimeout((connection as any).authTimeout);
    }

    // Close socket if still open
    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.close(code || 1000, reason || 'Normal closure');
    }

    // Update metrics
    const duration = this.metrics.connectionDuration.get(connectionId);
    if (duration) {
      const connectionTime = Date.now() - duration;
      this.metrics.connectionDuration.delete(connectionId);
      // Could track average connection duration here
    }

    // Remove from connections map
    this.connections.delete(connectionId);
    this.metrics.activeConnections = this.connections.size;

    // Emit disconnection event
    this.connectionSubject.next({
      type: 'disconnected',
      connection,
      code,
      reason,
    });

    this.emit('disconnection', { connection, code, reason });
  }

  /**
   * Get a connection by ID
   */
  public getConnection(connectionId: string): WebSocketConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Get all connections
   */
  public getConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get active connections (authenticated)
   */
  public getActiveConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter(conn => conn.isAuthenticated);
  }

  /**
   * Check if connection is active
   */
  public isConnectionActive(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    return !!(connection?.socket && connection.socket.readyState === WebSocket.OPEN);
  }

  /**
   * Update last activity timestamp
   */
  public updateActivity(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastActivity = new Date();
    }
  }

  /**
   * Get connection count
   */
  public getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get metrics
   */
  public getMetrics() {
    return {
      ...this.metrics,
      averageConnectionDuration: this.calculateAverageConnectionDuration(),
    };
  }

  /**
   * Broadcast to multiple connections
   */
  public getConnectionsByFilter(filter: (connection: WebSocketConnection) => boolean): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter(filter);
  }

  /**
   * Cleanup manager
   */
  public async shutdown(): Promise<void> {
    // Close all connections
    for (const [connectionId, connection] of this.connections) {
      this.disconnectConnection(connectionId, 1001, 'Server shutting down');
    }

    // Stop auth service cleanup
    if (this.authService) {
      this.authService.stopCleanup();
    }

    // Complete observables
    this.destroy$.next();
    this.destroy$.complete();
    this.connectionSubject.complete();
    this.errorSubject.complete();

    this.removeAllListeners();
  }

  // Private methods

  private setupSocketHandlers(connection: WebSocketConnection): void {
    const { socket } = connection;

    // Convert socket events to observables
    // WebSocket close event provides code and reason directly, not as an array
    const close$ = new Observable<{ code: number; reason: string }>(observer => {
      const handler = (code: number, reason: Buffer) => {
        observer.next({ code, reason: reason ? reason.toString() : '' });
      };
      socket.on('close', handler);
      return () => socket.off('close', handler);
    });

    const error$ = fromEvent<Error>(socket, 'error').pipe(
      map(error => ({
        error: new IntegrationError(
          `Socket error: ${error.message}`,
          IntegrationErrorCode.CONNECTION_FAILED
        ),
      }))
    );

    const pong$ = fromEvent(socket, 'pong');

    // Handle close event
    close$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ code, reason }) => {
        this.disconnectConnection(connection.id, code, reason);
      });

    // Handle error event
    error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ error }) => {
        this.errorSubject.next({ connection, error });
        this.emit('connection_error', { connection, error });

        // Close connection on critical errors
        if (error.code === IntegrationErrorCode.CONNECTION_FAILED) {
          this.disconnectConnection(connection.id, 1011, error.message);
        }
      });

    // Handle pong event (for heartbeat)
    pong$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        connection.lastActivity = new Date();
      });
  }

  private setAuthenticationTimeout(connection: WebSocketConnection): void {
    const timeout = setTimeout(() => {
      if (!connection.isAuthenticated) {
        this.disconnectConnection(connection.id, 1008, 'Authentication timeout');
      }
    }, this.config.connectionTimeout);

    // Store timeout reference on connection for cleanup
    (connection as any).authTimeout = timeout;
  }

  private async authenticateClient(connectRequest: ConnectRequest): Promise<AuthToken> {
    try {
      // Extract authentication credentials from the connection request
      const credentials = {
        clientId: connectRequest.clientId,
        apiKey: connectRequest.apiKey,
        token: connectRequest.token,
        clientSecret: connectRequest.clientSecret,
      };

      // Authenticate using the auth service
      const authToken = await this.authService.authenticate(credentials);

      // Verify the client has necessary permissions
      if (!this.authService.hasPermission(authToken, 'read')) {
        throw new IntegrationError(
          'Insufficient permissions',
          IntegrationErrorCode.AUTHORIZATION_FAILED
        );
      }

      return authToken;
    } catch (error) {
      if (error instanceof IntegrationError) {
        throw error;
      }
      throw new IntegrationError(
        'Authentication failed',
        IntegrationErrorCode.AUTHENTICATION_FAILED
      );
    }
  }

  private calculateAverageConnectionDuration(): number {
    if (this.metrics.connectionDuration.size === 0) return 0;

    const now = Date.now();
    let totalDuration = 0;

    for (const startTime of this.metrics.connectionDuration.values()) {
      totalDuration += now - startTime;
    }

    return totalDuration / this.metrics.connectionDuration.size;
  }
}