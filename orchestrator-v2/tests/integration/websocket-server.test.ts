/**
 * WebSocket Server Integration Tests
 *
 * Comprehensive tests for the WebSocket server component including
 * connection management, message handling, and real-time communication.
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { IntegrationWebSocketServer } from '../../core/integration/websocket-server';
import { StreamingBridge } from '../../core/integration/streaming-bridge';
import { HookManager } from '../../core/integration/hook-manager';
import { MessageType, ConnectRequest, WebSocketServerConfig } from '../../core/integration/types';
import { Subject } from 'rxjs';
import { integrationTestSetup } from './test-utils';

// Setup integration test environment
integrationTestSetup();

// Mock heavy dependencies
jest.mock('../../core/state/event-driven-state-manager');
jest.mock('../../core/execution/reactive-execution-engine');
jest.mock('../../core/plugins/plugin-manager');
jest.mock('../../core/integration/streaming-bridge');

describe('WebSocket Server Integration Tests', () => {
  let wsServer: IntegrationWebSocketServer;
  let streamingBridge: StreamingBridge;
  let hookManager: HookManager;
  let testPort: number;

  // Use short timeouts for testing
  const TEST_TIMEOUT = 100;
  const config: WebSocketServerConfig = {
    port: 0, // Let system assign port
    maxConnections: 100,
    maxStreamsPerConnection: 10,
    heartbeatInterval: TEST_TIMEOUT,
    connectionTimeout: TEST_TIMEOUT * 2,
    messageTimeout: TEST_TIMEOUT,
    maxMessageSize: 1024 * 1024,
    compression: false,
    authentication: {
      enabled: false,
      providers: ['none'],
    },
    rateLimit: {
      enabled: false,
      maxRequestsPerMinute: 100,
      burstLimit: 20,
    },
  };

  // Create mock instances
  const createMockObservable = () => ({
    pipe: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
    share: jest.fn().mockReturnThis(),
    retry: jest.fn().mockReturnThis(),
  });

  const mockStateManager: any = {
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    state$: new EventEmitter(),
    events$: createMockObservable(),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  };

  const mockExecutionEngine: any = {
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    createExecution: jest.fn().mockResolvedValue({ executionId: 'test-exec' }),
    execution$: new EventEmitter(),
    events$: createMockObservable(),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  };

  const mockPluginManager: any = {
    initialize: jest.fn().mockResolvedValue(undefined),
    plugins: new Map(),
  };

  beforeEach(async () => {
    // Initialize integration components with mocks
    hookManager = new HookManager({
      maxConcurrentExecutions: 10,
      executionTimeout: TEST_TIMEOUT * 10,
      registrySize: 100,
      versioningEnabled: true,
      enableSandbox: false,
      allowedPackages: [],
      migrationEnabled: true,
    });

    // Mock the StreamingBridge
    const MockedStreamingBridge = StreamingBridge as jest.MockedClass<typeof StreamingBridge>;
    streamingBridge = new MockedStreamingBridge(
      mockExecutionEngine,
      mockStateManager,
      {
        bufferSize: 100,
        backpressureThreshold: 1000,
        retryAttempts: 3,
        retryDelay: TEST_TIMEOUT,
        maxStreamsPerConnection: 10,
        streamTimeout: TEST_TIMEOUT * 10,
        metricsInterval: TEST_TIMEOUT * 50,
      }
    ) as any;

    // Mock StreamingBridge methods
    streamingBridge.addConnection = jest.fn();
    streamingBridge.removeConnection = jest.fn();
    streamingBridge.getStreamForConnection = jest.fn();

    // Create WebSocket server
    wsServer = new IntegrationWebSocketServer({
      config,
      streamingBridge,
      hookManager,
    });

    await wsServer.start();
    // Access the WebSocketServer's internal server
    const internalServer = (wsServer.wsServer as any)._server || (wsServer.wsServer as any).server;
    testPort = internalServer?.address?.()?.port || 8080;
  });

  afterEach(async () => {
    // Force close all clients to prevent hanging
    if (wsServer) {
      // Close all existing connections
      const connections = wsServer.getConnections();
      connections.forEach(conn => {
        if (conn.socket && conn.socket.readyState === WebSocket.OPEN) {
          conn.socket.terminate();
        }
      });

      await wsServer.stop();
    }

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Connection Management', () => {
    test('should accept WebSocket connections', async () => {
      const connectionPromise = new Promise((resolve) => {
        wsServer.once('connection', resolve);
      });

      const client = new WebSocket(`ws://localhost:${testPort}`);

      // Wait for client to be ready
      await new Promise((resolve, reject) => {
        client.once('open', resolve);
        client.once('error', reject);
      });

      const connection = await connectionPromise;
      expect(connection).toBeDefined();
      expect((connection as any).id).toBeDefined();

      client.terminate();
    }, 5000);

    test('should handle connection handshake', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);

      await new Promise((resolve) => {
        client.once('open', resolve);
      });

      const connectRequest: ConnectRequest = {
        version: '2.0.0',
        clientId: 'dev-client',
        apiKey: 'dev-api-key-123',
        capabilities: ['streaming', 'hooks'],
      };

      const messagePromise = new Promise((resolve) => {
        client.once('message', (data) => {
          const message = JSON.parse(data.toString());
          resolve(message);
        });
      });

      client.send(JSON.stringify({
        id: 'test-connect',
        type: MessageType.CONNECT,
        timestamp: new Date(),
        payload: connectRequest,
      }));

      const response = await messagePromise;
      expect((response as any).success).toBe(true);
      expect((response as any).payload.sessionId).toBeDefined();

      client.terminate();
    }, 5000);

    test('should handle disconnections gracefully', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.once('open', resolve));

      const disconnectionPromise = new Promise((resolve) => {
        wsServer.once('disconnection', resolve);
      });

      client.close();

      const disconnectionEvent = await disconnectionPromise;
      expect(disconnectionEvent).toBeDefined();
    }, 5000);
  });

  describe('Message Handling', () => {
    let client: WebSocket;

    beforeEach(async () => {
      client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.once('open', resolve));

      // Authenticate
      const connectRequest: ConnectRequest = {
        version: '2.0.0',
        clientId: 'dev-client',
        apiKey: 'dev-api-key-123',
        capabilities: ['streaming', 'hooks'],
      };

      client.send(JSON.stringify({
        id: 'test-connect',
        type: MessageType.CONNECT,
        timestamp: new Date(),
        payload: connectRequest,
      }));

      // Wait for authentication response
      await new Promise((resolve) => {
        client.once('message', resolve);
      });
    });

    afterEach(() => {
      if (client && client.readyState === WebSocket.OPEN) {
        client.terminate();
      }
    });

    test('should handle ping/pong messages', async () => {
      const responsePromise = new Promise((resolve) => {
        client.once('message', (data) => {
          const message = JSON.parse(data.toString());
          resolve(message);
        });
      });

      client.send(JSON.stringify({
        id: 'test-ping',
        type: MessageType.PING,
        timestamp: new Date(),
      }));

      const response = await responsePromise;
      expect((response as any).type).toBe(MessageType.PONG);
    }, 5000);

    test('should handle invalid messages gracefully', async () => {
      const responsePromise = new Promise((resolve) => {
        client.once('message', (data) => {
          const message = JSON.parse(data.toString());
          resolve(message);
        });
      });

      client.send('invalid json');

      const response = await responsePromise;
      expect((response as any).type).toBe(MessageType.ERROR);
    }, 5000);
  });

  describe('Metrics and Monitoring', () => {
    test('should collect connection metrics', async () => {
      const client1 = new WebSocket(`ws://localhost:${testPort}`);
      const client2 = new WebSocket(`ws://localhost:${testPort}`);

      await Promise.all([
        new Promise((resolve) => client1.once('open', resolve)),
        new Promise((resolve) => client2.once('open', resolve)),
      ]);

      const metrics = wsServer.getMetrics();
      expect(metrics.connections.activeConnections).toBeGreaterThanOrEqual(2);
      expect(metrics.connections.totalConnections).toBeGreaterThanOrEqual(2);

      client1.terminate();
      client2.terminate();
    }, 5000);

    test('should collect message metrics', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.once('open', resolve));

      const initialMetrics = wsServer.getMetrics();

      client.send(JSON.stringify({
        id: 'test-ping',
        type: MessageType.PING,
        timestamp: new Date(),
      }));

      await new Promise((resolve) => client.once('message', resolve));

      const finalMetrics = wsServer.getMetrics();
      expect(finalMetrics.server.messagesReceived).toBeGreaterThan(initialMetrics.server.messagesReceived);
      expect(finalMetrics.server.messagesSent).toBeGreaterThan(initialMetrics.server.messagesSent);

      client.terminate();
    }, 5000);
  });
});