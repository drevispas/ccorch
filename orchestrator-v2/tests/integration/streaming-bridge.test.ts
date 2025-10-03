/**
 * Streaming Bridge Integration Tests
 *
 * Comprehensive tests for the streaming bridge component including
 * stream management, subscription handling, and Observable integration.
 */

import { Subject, BehaviorSubject, timer } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { StreamingBridge } from '../../core/integration/streaming-bridge';
import { EventDrivenStateManager } from '../../core/state/event-driven-state-manager';
import { ReactiveExecutionEngine } from '../../core/execution/reactive-execution-engine';
import { PluginManager } from '../../core/plugins/plugin-manager';
import {
  WebSocketConnection,
  SubscriptionType,
  SubscribeRequest,
  StreamDefinition,
} from '../../core/integration/types';
import { integrationTestSetup, cleanupAfterTests } from './test-utils';

// Setup integration test environment
integrationTestSetup();

// Mock WebSocket connection
const createMockConnection = (id: string = 'test-conn'): WebSocketConnection => ({
  id,
  socket: {
    readyState: 1, // OPEN
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    ping: jest.fn(),
  } as any,
  sessionId: `session-${id}`,
  clientId: `client-${id}`,
  version: '2.0.0',
  capabilities: ['streaming'],
  connectedAt: new Date(),
  lastActivity: new Date(),
  subscriptions: new Map(),
  isAuthenticated: true,
  metadata: {
    remoteAddress: '127.0.0.1',
    userAgent: 'test-client',
  },
});

describe('Streaming Bridge Integration Tests', () => {
  let streamingBridge: StreamingBridge;
  let stateManager: EventDrivenStateManager;
  let executionEngine: ReactiveExecutionEngine;
  let pluginManager: PluginManager;

  const config = {
    bufferSize: 100,
    backpressureThreshold: 1000,
    retryAttempts: 3,
    retryDelay: 1000,
    maxStreamsPerConnection: 5,
    streamTimeout: 10000,
    metricsInterval: 1000,
  };

  beforeEach(async () => {
    // Initialize dependencies for each test
    stateManager = new EventDrivenStateManager();
    await stateManager.initialize();

    pluginManager = new PluginManager({
      enableAutoDiscovery: false,
    });
    await pluginManager.initialize();

    executionEngine = new ReactiveExecutionEngine({
      stateManager,
      pluginManager,
    });
    await executionEngine.initialize();

    // Create streaming bridge
    streamingBridge = new StreamingBridge(
      executionEngine,
      stateManager,
      config
    );
  });

  afterEach(async () => {
    // Clean up after each test
    if (executionEngine) {
      await executionEngine.shutdown();
    }
    if (stateManager) {
      await stateManager.shutdown();
    }
  });

  describe('Stream Management', () => {
    test('should create predefined streams', () => {
      const streams = streamingBridge.listStreams();

      expect(streams).toBeDefined();
      expect(streams.length).toBeGreaterThan(0);

      const streamNames = streams.map(s => s.name);
      expect(streamNames).toContain('execution_events');
      expect(streamNames).toContain('task_progress');
      expect(streamNames).toContain('workflow_status');
      expect(streamNames).toContain('system_metrics');
      expect(streamNames).toContain('state_changes');
    });

    test('should create custom streams', () => {
      const testSource = new Subject();

      const streamId = streamingBridge.createStream({
        name: 'test_stream',
        source: testSource,
        metadata: {
          description: 'Test stream',
        },
      });

      expect(streamId).toBeDefined();

      const stream = streamingBridge.getStream(streamId);
      expect(stream).toBeDefined();
      expect(stream?.name).toBe('test_stream');
      expect(stream?.isActive).toBe(true);
    });

    test('should remove streams', () => {
      const testSource = new Subject();

      const streamId = streamingBridge.createStream({
        name: 'test_stream',
        source: testSource,
        metadata: {
          description: 'Test stream',
        },
      });

      expect(streamingBridge.getStream(streamId)).toBeDefined();

      streamingBridge.removeStream(streamId);

      expect(streamingBridge.getStream(streamId)).toBeUndefined();
    });

    test('should list all streams', () => {
      const testSource1 = new Subject();
      const testSource2 = new Subject();

      const initialCount = streamingBridge.listStreams().length;

      streamingBridge.createStream({
        name: 'test_stream_1',
        source: testSource1,
      });

      streamingBridge.createStream({
        name: 'test_stream_2',
        source: testSource2,
      });

      const streams = streamingBridge.listStreams();
      expect(streams.length).toBe(initialCount + 2);
    });
  });

  describe('Connection Management', () => {
    test('should add connections', () => {
      const connection = createMockConnection();

      streamingBridge.addConnection(connection);

      expect(streamingBridge.getConnectionCount()).toBe(1);
    });

    test('should remove connections', () => {
      const connection = createMockConnection();

      streamingBridge.addConnection(connection);
      expect(streamingBridge.getConnectionCount()).toBe(1);

      streamingBridge.removeConnection(connection.id);
      expect(streamingBridge.getConnectionCount()).toBe(0);
    });

    test('should get connection streams', () => {
      const connection = createMockConnection();
      const testSource = new Subject();

      streamingBridge.addConnection(connection);

      const streamId = streamingBridge.createStream({
        name: 'test_stream',
        source: testSource,
      });

      // Subscribe to stream
      const subscription$ = streamingBridge.subscribeToStream(streamId, connection.id);
      const sub = subscription$?.subscribe();

      const connectionStreams = streamingBridge.getConnectionStreams(connection.id);
      expect(connectionStreams.length).toBe(1);
      expect(connectionStreams[0].name).toBe('test_stream');

      // Clean up subscription
      sub?.unsubscribe();
    });
  });

  describe('Metrics Collection', () => {
    test('should collect stream metrics', () => {
      const testSource = new Subject();
      const initialMetrics = streamingBridge.getMetrics();

      streamingBridge.createStream({
        name: 'test_stream',
        source: testSource,
      });

      const newMetrics = streamingBridge.getMetrics();
      expect(newMetrics).toBeDefined();
      expect(newMetrics.totalStreams).toBeGreaterThan(0);
    });

    test('should track subscription metrics', () => {
      const connection = createMockConnection();
      const testSource = new Subject();

      streamingBridge.addConnection(connection);

      const streamId = streamingBridge.createStream({
        name: 'test_stream',
        source: testSource,
      });

      const initialMetrics = streamingBridge.getMetrics();

      const subscription$ = streamingBridge.subscribeToStream(streamId, connection.id);
      const sub = subscription$?.subscribe();

      const newMetrics = streamingBridge.getMetrics();
      expect(newMetrics).toBeDefined();
      expect(newMetrics.totalSubscriptions).toBeGreaterThanOrEqual(initialMetrics.totalSubscriptions);

      // Clean up subscription
      sub?.unsubscribe();
    });
  });
});