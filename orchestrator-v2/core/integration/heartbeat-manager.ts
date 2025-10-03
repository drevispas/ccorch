import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { Observable, Subject, interval } from 'rxjs';
import { takeUntil, filter, tap } from 'rxjs/operators';

import { WebSocketConnection } from './types';

export interface HeartbeatConfig {
  interval: number;
  timeout: number;
  maxMissedPings?: number;
}

export interface HeartbeatEvent {
  type: 'ping_sent' | 'pong_received' | 'timeout' | 'connection_stale';
  connectionId: string;
  timestamp: Date;
  missedPings?: number;
}

export class HeartbeatManager extends EventEmitter {
  private config: HeartbeatConfig;
  private heartbeatInterval?: NodeJS.Timeout;
  private connectionStates: Map<string, ConnectionHeartbeatState> = new Map();

  // Observable streams
  private heartbeatSubject = new Subject<HeartbeatEvent>();
  private destroy$ = new Subject<void>();

  public heartbeats$ = this.heartbeatSubject.asObservable();

  // Metrics
  private metrics = {
    totalPingsSent: 0,
    totalPongsReceived: 0,
    staleConnections: 0,
    averageLatency: 0,
    maxLatency: 0,
    minLatency: Number.MAX_VALUE,
  };

  constructor(config: HeartbeatConfig) {
    super();
    this.config = {
      ...config,
      maxMissedPings: config.maxMissedPings || 2,
    };
  }

  /**
   * Start heartbeat monitoring
   */
  public start(): void {
    if (this.heartbeatInterval) {
      return; // Already started
    }

    // Use only traditional interval - avoid duplicate heartbeat checks
    this.heartbeatInterval = setInterval(() => {
      this.performHeartbeatCheck();
    }, this.config.interval);
  }

  /**
   * Stop heartbeat monitoring
   */
  public stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    // Clear all connection states
    this.connectionStates.forEach(state => {
      if (state.timeoutTimer) {
        clearTimeout(state.timeoutTimer);
      }
    });
    this.connectionStates.clear();

    // Complete observable
    this.destroy$.next();
    this.destroy$.complete();
    this.heartbeatSubject.complete();

    this.removeAllListeners();
  }

  /**
   * Register a connection for heartbeat monitoring
   */
  public registerConnection(connection: WebSocketConnection): void {
    const state: ConnectionHeartbeatState = {
      connectionId: connection.id,
      connection,
      lastPingSentAt: null,
      lastPongReceivedAt: new Date(),
      missedPings: 0,
      isStale: false,
      latencies: [],
    };

    this.connectionStates.set(connection.id, state);

    // Setup pong listener
    connection.socket.on('pong', (data) => {
      this.handlePong(connection.id, data);
    });
  }

  /**
   * Unregister a connection from heartbeat monitoring
   */
  public unregisterConnection(connectionId: string): void {
    const state = this.connectionStates.get(connectionId);
    if (state) {
      if (state.timeoutTimer) {
        clearTimeout(state.timeoutTimer);
      }
      this.connectionStates.delete(connectionId);
    }
  }

  /**
   * Check if a connection is stale
   */
  public isConnectionStale(connectionId: string): boolean {
    const state = this.connectionStates.get(connectionId);
    return state?.isStale || false;
  }

  /**
   * Get connection health status
   */
  public getConnectionHealth(connectionId: string): ConnectionHealth | undefined {
    const state = this.connectionStates.get(connectionId);
    if (!state) return undefined;

    return {
      connectionId,
      isHealthy: !state.isStale && state.missedPings < this.config.maxMissedPings!,
      missedPings: state.missedPings,
      lastActivity: state.lastPongReceivedAt,
      averageLatency: this.calculateAverageLatency(state.latencies),
      isStale: state.isStale,
    };
  }

  /**
   * Get all stale connections
   */
  public getStaleConnections(): string[] {
    const staleConnections: string[] = [];

    this.connectionStates.forEach((state, connectionId) => {
      if (state.isStale) {
        staleConnections.push(connectionId);
      }
    });

    return staleConnections;
  }

  /**
   * Get metrics
   */
  public getMetrics() {
    return {
      ...this.metrics,
      activeConnections: this.connectionStates.size,
      healthyConnections: this.getHealthyConnectionCount(),
    };
  }

  /**
   * Manually trigger a heartbeat check
   */
  public triggerHeartbeat(): void {
    this.performHeartbeatCheck();
  }

  // Private methods

  private performHeartbeatCheck(): void {
    const now = new Date();
    const timeoutThreshold = new Date(now.getTime() - this.config.timeout);

    this.connectionStates.forEach((state, connectionId) => {
      try {
        // Check if connection is still active
        if (!state.connection.socket ||
            state.connection.socket.readyState !== WebSocket.OPEN) {
          this.unregisterConnection(connectionId);
          return;
        }

        // Check for timeout
        if (state.lastPongReceivedAt < timeoutThreshold) {
          state.missedPings++;

          if (state.missedPings >= this.config.maxMissedPings!) {
            // Connection is stale
            state.isStale = true;
            this.metrics.staleConnections++;

            this.heartbeatSubject.next({
              type: 'connection_stale',
              connectionId,
              timestamp: now,
              missedPings: state.missedPings,
            });

            this.emit('connection_stale', {
              connectionId,
              connection: state.connection,
              missedPings: state.missedPings,
            });

            return;
          }

          this.heartbeatSubject.next({
            type: 'timeout',
            connectionId,
            timestamp: now,
            missedPings: state.missedPings,
          });
        }

        // Send ping
        this.sendPing(state);

      } catch (error) {
        console.error(`Heartbeat error for connection ${connectionId}:`, error);
        this.emit('error', { connectionId, error });
      }
    });
  }

  private sendPing(state: ConnectionHeartbeatState): void {
    const now = new Date();
    state.lastPingSentAt = now;

    // Send ping with timestamp as data
    const pingData = Buffer.from(now.getTime().toString());
    state.connection.socket.ping(pingData);

    this.metrics.totalPingsSent++;

    this.heartbeatSubject.next({
      type: 'ping_sent',
      connectionId: state.connectionId,
      timestamp: now,
    });

    // Set timeout for this specific ping
    if (state.timeoutTimer) {
      clearTimeout(state.timeoutTimer);
    }

    state.timeoutTimer = setTimeout(() => {
      if (state.lastPongReceivedAt &&
          state.lastPingSentAt &&
          state.lastPongReceivedAt < state.lastPingSentAt) {
        state.missedPings++;

        this.heartbeatSubject.next({
          type: 'timeout',
          connectionId: state.connectionId,
          timestamp: new Date(),
          missedPings: state.missedPings,
        });
      }
    }, this.config.timeout);
  }

  private handlePong(connectionId: string, data: Buffer): void {
    const state = this.connectionStates.get(connectionId);
    if (!state) return;

    const now = new Date();
    state.lastPongReceivedAt = now;
    state.missedPings = 0;
    state.isStale = false;

    // Clear timeout timer
    if (state.timeoutTimer) {
      clearTimeout(state.timeoutTimer);
      state.timeoutTimer = undefined;
    }

    // Calculate latency if ping timestamp is available
    if (data && data.length > 0) {
      try {
        const pingSentTime = parseInt(data.toString(), 10);
        const latency = now.getTime() - pingSentTime;

        // Update latency metrics
        state.latencies.push(latency);
        if (state.latencies.length > 10) {
          state.latencies.shift(); // Keep only last 10 latencies
        }

        this.updateLatencyMetrics(latency);
      } catch (error) {
        // Ignore latency calculation errors
      }
    }

    this.metrics.totalPongsReceived++;

    this.heartbeatSubject.next({
      type: 'pong_received',
      connectionId,
      timestamp: now,
    });

    // Update connection last activity
    state.connection.lastActivity = now;
  }

  private updateLatencyMetrics(latency: number): void {
    // Update min/max
    if (latency < this.metrics.minLatency) {
      this.metrics.minLatency = latency;
    }
    if (latency > this.metrics.maxLatency) {
      this.metrics.maxLatency = latency;
    }

    // Update average
    const totalPongs = this.metrics.totalPongsReceived;
    this.metrics.averageLatency =
      (this.metrics.averageLatency * (totalPongs - 1) + latency) / totalPongs;
  }

  private calculateAverageLatency(latencies: number[]): number {
    if (latencies.length === 0) return 0;

    const sum = latencies.reduce((acc, val) => acc + val, 0);
    return sum / latencies.length;
  }

  private getHealthyConnectionCount(): number {
    let count = 0;

    this.connectionStates.forEach(state => {
      if (!state.isStale && state.missedPings < this.config.maxMissedPings!) {
        count++;
      }
    });

    return count;
  }
}

interface ConnectionHeartbeatState {
  connectionId: string;
  connection: WebSocketConnection;
  lastPingSentAt: Date | null;
  lastPongReceivedAt: Date;
  missedPings: number;
  isStale: boolean;
  timeoutTimer?: NodeJS.Timeout;
  latencies: number[];
}

interface ConnectionHealth {
  connectionId: string;
  isHealthy: boolean;
  missedPings: number;
  lastActivity: Date;
  averageLatency: number;
  isStale: boolean;
}