import { EventEmitter } from 'events';
import { Observable, Subject, BehaviorSubject, merge, EMPTY, throwError, timer } from 'rxjs';
import {
  map,
  filter,
  takeUntil,
  tap,
  catchError,
  share,
  shareReplay,
  throttleTime,
  buffer,
  bufferTime,
  mergeMap,
  switchMap,
  distinctUntilChanged,
  retry,
  timeout,
} from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

import {
  WebSocketConnection,
  StreamDefinition,
  StreamManager,
  Subscription,
  SubscriptionType,
  SubscribeRequest,
  MessageType,
  EventMessage,
  TaskProgress,
  WorkflowStatus,
  IntegrationError,
  IntegrationErrorCode,
} from './types';

import {
  ExecutionEvent,
  ExecutionEventType,
  ExecutionContext,
  ExecutionMetrics,
  TaskExecution,
} from '../execution/types';

import { ReactiveExecutionEngine } from '../execution/reactive-execution-engine';
import { EventDrivenStateManager } from '../state/event-driven-state-manager';

export interface StreamingBridgeConfig {
  bufferSize: number;
  backpressureThreshold: number;
  retryAttempts: number;
  retryDelay: number;
  maxStreamsPerConnection: number;
  streamTimeout: number;
  metricsInterval: number;
}

export class StreamingBridge extends EventEmitter implements StreamManager {
  private streams: Map<string, StreamDefinition> = new Map();
  private connections: Map<string, WebSocketConnection> = new Map();
  private subscriptions: Map<string, Map<string, Subscription>> = new Map(); // connectionId -> subscriptionId -> subscription
  private executionEngine: ReactiveExecutionEngine;
  private stateManager: EventDrivenStateManager;
  private config: StreamingBridgeConfig;

  // Observable streams from core components
  private executionEvents$!: Observable<ExecutionEvent>;
  private stateChanges$!: Observable<any>;
  private taskProgress$!: Observable<TaskProgress>;
  private workflowStatus$!: Observable<WorkflowStatus>;
  private systemMetrics$!: Observable<ExecutionMetrics>;

  // Internal subjects for bridge management
  private streamCreated$ = new Subject<StreamDefinition>();
  private streamDestroyed$ = new Subject<string>();
  private subscriptionCreated$ = new Subject<{ connectionId: string; subscription: Subscription }>();
  private subscriptionDestroyed$ = new Subject<{ connectionId: string; subscriptionId: string }>();
  private errorSubject = new Subject<{ streamId?: string; connectionId?: string; error: any }>();

  // Metrics
  private metrics = {
    totalStreams: 0,
    activeStreams: 0,
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    eventsProcessed: 0,
    errorsCount: 0,
    averageLatency: 0,
    messagesTransferred: 0,
    lastReset: Date.now(),
  };

  constructor(
    executionEngine: ReactiveExecutionEngine,
    stateManager: EventDrivenStateManager,
    config: StreamingBridgeConfig
  ) {
    super();

    this.executionEngine = executionEngine;
    this.stateManager = stateManager;
    this.config = config;

    this.initializeStreams();
    this.setupMetricsCollection();
  }

  private initializeStreams(): void {
    // Get observable streams from core components
    this.executionEvents$ = this.executionEngine.events$.pipe(
      share(),
      retry(this.config.retryAttempts)
    );

    this.stateChanges$ = this.stateManager.events$.pipe(
      share(),
      retry(this.config.retryAttempts)
    );

    // Create derived streams
    this.taskProgress$ = this.executionEvents$.pipe(
      filter(event => event.type === ExecutionEventType.TASK_PROGRESS || event.type === ExecutionEventType.TASK_UPDATED),
      map(event => this.transformToTaskProgress(event)),
      share()
    );

    this.workflowStatus$ = this.stateChanges$.pipe(
      filter(event => event.type === 'WorkflowStatusChanged'),
      map(event => this.transformToWorkflowStatus(event)),
      distinctUntilChanged((a, b) => a.workflowId === b.workflowId && a.status === b.status),
      share()
    );

    this.systemMetrics$ = timer(0, this.config.metricsInterval).pipe(
      switchMap(() => this.collectSystemMetrics()),
      share()
    );

    // Create predefined streams
    this.createPredefinedStreams();
  }

  private createPredefinedStreams(): void {
    // Execution events stream
    this.createStream({
      name: 'execution_events',
      source: this.executionEvents$,
      metadata: {
        description: 'Real-time execution events from the orchestrator engine',
      },
    });

    // Task progress stream
    this.createStream({
      name: 'task_progress',
      source: this.taskProgress$,
      metadata: {
        description: 'Real-time task progress updates',
      },
    });

    // Workflow status stream
    this.createStream({
      name: 'workflow_status',
      source: this.workflowStatus$,
      metadata: {
        description: 'Workflow status changes',
      },
    });

    // System metrics stream
    this.createStream({
      name: 'system_metrics',
      source: this.systemMetrics$,
      metadata: {
        description: 'System performance metrics',
      },
    });

    // State changes stream
    this.createStream({
      name: 'state_changes',
      source: this.stateChanges$,
      metadata: {
        description: 'State manager events and changes',
      },
    });
  }

  private transformToTaskProgress(event: ExecutionEvent): TaskProgress {
    return {
      taskId: event.taskId || 'unknown',
      workflowId: event.workflowId || 'unknown',
      agentName: event.metadata?.agentName || 'unknown',
      stage: event.metadata?.stage || 'unknown',
      progress: event.metadata?.progress || 0,
      message: event.message,
      estimatedCompletion: event.metadata?.estimatedCompletion,
      metrics: {
        startTime: event.timestamp,
        elapsedTime: event.metadata?.elapsedTime || 0,
        estimatedRemainingTime: event.metadata?.estimatedRemainingTime,
      },
    };
  }

  private transformToWorkflowStatus(event: any): WorkflowStatus {
    return {
      workflowId: event.payload.workflowId,
      status: event.payload.status,
      startedAt: event.payload.startedAt,
      completedAt: event.payload.completedAt,
      currentTask: event.payload.currentTask,
      progress: {
        completed: event.payload.progress?.completed || 0,
        total: event.payload.progress?.total || 0,
        percentage: event.payload.progress?.percentage || 0,
      },
      metrics: event.payload.metrics,
    };
  }

  private async collectSystemMetrics(): Promise<ExecutionMetrics> {
    // Collect metrics from execution engine
    const executionMetrics = await this.executionEngine.getMetrics();

    // Extend with bridge-specific metrics
    const bridgeMetrics: ExecutionMetrics = {
      ...executionMetrics,
      // Add bridge-specific values to existing fields
      throughput: this.calculateBridgeThroughput(),
      // Note: Bridge-specific fields like streaming stats are tracked separately in this.metrics
    };

    return bridgeMetrics;
  }

  private calculateBridgeThroughput(): number {
    // Calculate messages per second based on recent activity
    const now = Date.now();
    const windowSize = 60000; // 1 minute window
    const recentMessages = this.metrics.messagesTransferred;
    const elapsedTime = now - (this.metrics.lastReset || now);

    if (elapsedTime === 0) return 0;
    return (recentMessages / elapsedTime) * 1000; // messages per second
  }

  private setupMetricsCollection(): void {
    // Monitor stream lifecycle
    this.streamCreated$.subscribe(() => {
      this.metrics.totalStreams++;
      this.metrics.activeStreams = this.streams.size;
    });

    this.streamDestroyed$.subscribe(() => {
      this.metrics.activeStreams = this.streams.size;
    });

    // Monitor subscription lifecycle
    this.subscriptionCreated$.subscribe(() => {
      this.metrics.totalSubscriptions++;
      this.updateActiveSubscriptions();
    });

    this.subscriptionDestroyed$.subscribe(() => {
      this.updateActiveSubscriptions();
    });
  }

  private updateActiveSubscriptions(): void {
    let total = 0;
    for (const connectionSubs of this.subscriptions.values()) {
      total += connectionSubs.size;
    }
    this.metrics.activeSubscriptions = total;
  }

  // StreamManager interface implementation

  public createStream(definition: Omit<StreamDefinition, 'id' | 'subscribers' | 'isActive' | 'createdAt'>): string {
    const streamId = uuidv4();

    const stream: StreamDefinition = {
      id: streamId,
      name: definition.name,
      source: definition.source,
      subscribers: new Set(),
      isActive: true,
      createdAt: new Date(),
      metadata: definition.metadata || {},
    };

    this.streams.set(streamId, stream);
    this.streamCreated$.next(stream);

    this.emit('stream_created', stream);
    return streamId;
  }

  public getStream(streamId: string): StreamDefinition | undefined {
    return this.streams.get(streamId);
  }

  public subscribeToStream(streamId: string, connectionId: string): Observable<any> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      return throwError(() => new Error(`Stream ${streamId} not found`));
    }

    const connection = this.connections.get(connectionId);
    if (!connection) {
      return throwError(() => new Error(`Connection ${connectionId} not found`));
    }

    // Check connection limits
    const connectionSubs = this.subscriptions.get(connectionId) || new Map();
    if (connectionSubs.size >= this.config.maxStreamsPerConnection) {
      return throwError(() => new Error('Maximum streams per connection exceeded'));
    }

    // Add connection to stream subscribers
    stream.subscribers.add(connectionId);

    // Create subscription observable with error handling and backpressure
    const subscription$ = stream.source.pipe(
      bufferTime(100), // Buffer events to reduce message frequency
      filter(events => events.length > 0), // Only emit when there are events
      map(events => events.length === 1 ? events[0] : events), // Flatten single events
      tap(() => {
        this.metrics.eventsProcessed++;
        this.metrics.messagesTransferred++;
      }),
      timeout(this.config.streamTimeout),
      catchError(error => {
        this.metrics.errorsCount++;
        this.handleStreamError(streamId, connectionId, error);
        return EMPTY;
      }),
      takeUntil(this.createUnsubscribeSignal(streamId, connectionId)),
      share()
    );

    return subscription$;
  }

  public unsubscribeFromStream(streamId: string, connectionId: string): void {
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.subscribers.delete(connectionId);
    }

    const connectionSubs = this.subscriptions.get(connectionId);
    if (connectionSubs) {
      for (const [subId, subscription] of connectionSubs) {
        if (subscription.id === streamId) {
          connectionSubs.delete(subId);
          this.subscriptionDestroyed$.next({ connectionId, subscriptionId: subId });
          break;
        }
      }
    }

    this.emit('unsubscribed', { streamId, connectionId });
  }

  public removeStream(streamId: string): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;

    // Unsubscribe all connections
    for (const connectionId of stream.subscribers) {
      this.unsubscribeFromStream(streamId, connectionId);
    }

    // Remove stream
    stream.isActive = false;
    this.streams.delete(streamId);
    this.streamDestroyed$.next(streamId);

    this.emit('stream_removed', streamId);
  }

  public listStreams(): StreamDefinition[] {
    return Array.from(this.streams.values());
  }

  public getConnectionStreams(connectionId: string): StreamDefinition[] {
    return Array.from(this.streams.values()).filter(stream =>
      stream.subscribers.has(connectionId)
    );
  }

  public get errors$(): Observable<{ streamId?: string; connectionId?: string; error: any }> {
    return this.errorSubject.asObservable();
  }

  // Connection management

  public addConnection(connection: WebSocketConnection): void {
    this.connections.set(connection.id, connection);
    this.subscriptions.set(connection.id, new Map());
    this.emit('connection_added', connection);
  }

  public removeConnection(connectionId: string): void {
    // Unsubscribe from all streams
    const connectionStreams = this.getConnectionStreams(connectionId);
    for (const stream of connectionStreams) {
      this.unsubscribeFromStream(stream.id, connectionId);
    }

    // Clean up
    this.connections.delete(connectionId);
    this.subscriptions.delete(connectionId);

    this.emit('connection_removed', connectionId);
  }

  // Subscription management with filters

  public async createSubscription(
    connectionId: string,
    subscribeRequest: SubscribeRequest
  ): Promise<string> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    const subscriptionId = uuidv4();

    // Find or create appropriate stream
    const stream = this.findStreamForSubscription(subscribeRequest);
    if (!stream) {
      throw new Error(`No stream available for subscription type: ${subscribeRequest.subscriptionType}`);
    }

    // Create filtered observable
    const filteredStream$ = this.applyFilters(stream.source, subscribeRequest.filters || {});

    // Create subscription
    const subscription: Subscription = {
      id: subscriptionId,
      type: subscribeRequest.subscriptionType,
      filters: subscribeRequest.filters || {},
      options: subscribeRequest.options || {},
      stream: filteredStream$,
      eventCount: 0,
    };

    // Store subscription
    const connectionSubs = this.subscriptions.get(connectionId)!;
    connectionSubs.set(subscriptionId, subscription);

    // Start streaming to connection
    this.startStreaming(connection, subscription);

    this.subscriptionCreated$.next({ connectionId, subscription });
    this.emit('subscription_created', { connectionId, subscription });

    return subscriptionId;
  }

  private findStreamForSubscription(subscribeRequest: SubscribeRequest): StreamDefinition | undefined {
    const streamMap: Record<SubscriptionType, string> = {
      [SubscriptionType.WORKFLOW_EXECUTION]: 'execution_events',
      [SubscriptionType.TASK_PROGRESS]: 'task_progress',
      [SubscriptionType.EXECUTION_METRICS]: 'system_metrics',
      [SubscriptionType.SYSTEM_LOGS]: 'execution_events', // Filter later
      [SubscriptionType.HOOK_EVENTS]: 'execution_events', // Filter later
      [SubscriptionType.STATE_CHANGES]: 'state_changes',
    };

    const streamName = streamMap[subscribeRequest.subscriptionType];
    return Array.from(this.streams.values()).find(stream => stream.name === streamName);
  }

  private applyFilters(source: Observable<any>, filters: Record<string, any>): Observable<any> {
    return source.pipe(
      filter(event => {
        // Apply workflowId filter
        if (filters.workflowId && event.workflowId !== filters.workflowId) {
          return false;
        }

        // Apply taskId filter
        if (filters.taskId && event.taskId !== filters.taskId) {
          return false;
        }

        // Apply agentName filter
        if (filters.agentName && event.agentName !== filters.agentName) {
          return false;
        }

        // Apply logLevel filter
        if (filters.logLevel && event.level && event.level !== filters.logLevel) {
          return false;
        }

        // Apply eventTypes filter
        if (filters.eventTypes && Array.isArray(filters.eventTypes)) {
          if (!filters.eventTypes.includes(event.type)) {
            return false;
          }
        }

        return true;
      })
    );
  }

  private startStreaming(connection: WebSocketConnection, subscription: Subscription): void {
    subscription.stream.subscribe({
      next: (data) => {
        this.sendStreamData(connection, subscription, data);
      },
      error: (error) => {
        this.handleSubscriptionError(connection, subscription, error);
      },
      complete: () => {
        this.handleSubscriptionComplete(connection, subscription);
      },
    });
  }

  private async sendStreamData(
    connection: WebSocketConnection,
    subscription: Subscription,
    data: any
  ): Promise<void> {
    try {
      const message: EventMessage = {
        id: uuidv4(),
        type: MessageType.EXECUTION_EVENT,
        timestamp: new Date(),
        event: subscription.type,
        payload: data,
        correlationId: subscription.id,
      };

      await this.sendToConnection(connection, message);

      subscription.eventCount++;
      subscription.lastEvent = new Date();

    } catch (error) {
      this.handleStreamError(subscription.id, connection.id, error);
    }
  }

  private async sendToConnection(connection: WebSocketConnection, message: any): Promise<void> {
    // This will be called by the WebSocket server
    this.emit('send_message', { connection, message });
  }

  private createUnsubscribeSignal(streamId: string, connectionId: string): Observable<any> {
    return new Observable(subscriber => {
      const handler = (data: { streamId: string; connectionId: string }) => {
        if (data.streamId === streamId && data.connectionId === connectionId) {
          subscriber.next(null);
          subscriber.complete();
        }
      };

      this.on('unsubscribed', handler);
      return () => this.off('unsubscribed', handler);
    });
  }

  private handleStreamError(streamId: string, connectionId: string, error: any): void {
    const integrationError = new IntegrationError(
      `Stream error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      IntegrationErrorCode.STREAM_ERROR
    );

    this.errorSubject.next({ streamId, connectionId, error: integrationError });
    this.emit('stream_error', { streamId, connectionId, error: integrationError });
  }

  private handleSubscriptionError(
    connection: WebSocketConnection,
    subscription: Subscription,
    error: any
  ): void {
    const integrationError: IntegrationError = {
      name: 'IntegrationError',
      message: `Subscription error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      code: IntegrationErrorCode.SUBSCRIPTION_FAILED,
      timestamp: new Date(),
    };

    this.emit('subscription_error', { connection, subscription, error: integrationError });
  }

  private handleSubscriptionComplete(connection: WebSocketConnection, subscription: Subscription): void {
    this.emit('subscription_complete', { connection, subscription });
  }

  // Public API

  public getMetrics() {
    return { ...this.metrics };
  }

  public getActiveStreams(): StreamDefinition[] {
    return Array.from(this.streams.values()).filter(stream => stream.isActive);
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }

  public getSubscriptionCount(): number {
    return this.metrics.activeSubscriptions;
  }
}