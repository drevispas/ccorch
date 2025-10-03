/**
 * Integration Layer Full Integration Tests
 *
 * End-to-end tests for the complete integration layer including
 * WebSocket server, streaming bridge, hook manager, and protocol handler
 * working together with Phase 1 and Phase 2 components.
 */

import WebSocket from 'ws';
import { IntegrationLayer, DEFAULT_INTEGRATION_CONFIG } from '../../core/integration';
import { EventDrivenStateManager } from '../../core/state/event-driven-state-manager';
import { ReactiveExecutionEngine } from '../../core/execution/reactive-execution-engine';
import { PluginManager } from '../../core/plugins/plugin-manager';
import {
  MessageType,
  ConnectRequest,
  ExecuteWorkflowRequest,
  SubscribeRequest,
  SubscriptionType,
  IntegrationStatus,
} from '../../core/integration/types';
import { integrationTestSetup } from './test-utils';

// Setup integration test environment
integrationTestSetup();

describe('Integration Layer Full Integration Tests', () => {
  let integrationLayer: IntegrationLayer;
  let stateManager: EventDrivenStateManager;
  let executionEngine: ReactiveExecutionEngine;
  let pluginManager: PluginManager;
  let testPort: number;

  const config = {
    ...DEFAULT_INTEGRATION_CONFIG,
    websocket: {
      ...DEFAULT_INTEGRATION_CONFIG.websocket,
      port: 0, // Let system assign port
      heartbeatInterval: 1000, // Faster for testing
    },
    streaming: {
      ...DEFAULT_INTEGRATION_CONFIG.streaming,
      retryDelay: 100, // Faster for testing
    },
    hooks: {
      ...DEFAULT_INTEGRATION_CONFIG.hooks,
      executionTimeout: 5000, // Shorter for testing
    },
  };

  beforeEach(async () => {
    // Initialize core dependencies (Phase 1 and Phase 2 components)
    stateManager = new EventDrivenStateManager();
    await stateManager.initialize();

    pluginManager = new PluginManager({
      enableAutoDiscovery: false,
    });
    await pluginManager.initialize();

    executionEngine = new ReactiveExecutionEngine({
      stateManager,
      pluginManager,
      enableCircuitBreaker: true,
      enableRetries: true,
      enableMonitoring: true,
    });
    await executionEngine.initialize();

    // Create integration layer
    integrationLayer = new IntegrationLayer(config, {
      executionEngine,
      stateManager,
    });

    await integrationLayer.start();
    const wsServer = integrationLayer.getWebSocketServer().wsServer;
    const internalServer = (wsServer as any)._server || (wsServer as any).server;
    testPort = internalServer?.address?.()?.port || 8080;
  });

  afterEach(async () => {
    if (integrationLayer?.isRunning()) {
      await integrationLayer.stop();
    }
    if (executionEngine) {
      await executionEngine.shutdown();
    }
    if (stateManager) {
      await stateManager.shutdown();
    }
  });

  describe('Full Integration Lifecycle', () => {
    test('should complete full workflow execution with real-time streaming', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.once('open', resolve));

      // Step 1: Authenticate
      const connectRequest: ConnectRequest = {
        version: '2.0.0',
        clientId: 'integration-test-client',
        capabilities: ['streaming', 'hooks', 'workflow_control'],
      };

      client.send(JSON.stringify({
        id: 'connect-msg',
        type: MessageType.CONNECT,
        timestamp: new Date(),
        payload: connectRequest,
      }));

      const authResponse = await new Promise((resolve) => {
        client.once('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect((authResponse as any).success).toBe(true);
      expect((authResponse as any).payload.sessionId).toBeDefined();

      // Step 2: Subscribe to workflow execution events
      client.send(JSON.stringify({
        id: 'subscribe-execution',
        type: MessageType.SUBSCRIBE,
        timestamp: new Date(),
        payload: {
          subscriptionType: SubscriptionType.WORKFLOW_EXECUTION,
          filters: {},
          options: {
            includeHistory: false,
            maxEvents: 100,
          },
        } as SubscribeRequest,
      }));

      const subscribeResponse = await new Promise((resolve) => {
        client.once('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect((subscribeResponse as any).success).toBe(true);

      // Step 3: Subscribe to task progress
      client.send(JSON.stringify({
        id: 'subscribe-progress',
        type: MessageType.SUBSCRIBE,
        timestamp: new Date(),
        payload: {
          subscriptionType: SubscriptionType.TASK_PROGRESS,
          filters: {},
          options: {},
        } as SubscribeRequest,
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      // Step 4: Execute workflow
      const workflowRequest: ExecuteWorkflowRequest = {
        workflowType: 'backend-architecture',
        taskDescription: 'Create a REST API for user management',
        projectDirectory: '/tmp/integration-test',
        complexity: 'moderate',
        options: {
          streamExecution: true,
          includeMetrics: true,
          includeLogs: true,
        },
      };

      client.send(JSON.stringify({
        id: 'execute-workflow',
        type: MessageType.EXECUTE_WORKFLOW,
        timestamp: new Date(),
        payload: workflowRequest,
      }));

      const executeResponse = await new Promise((resolve) => {
        client.once('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect((executeResponse as any).success).toBe(true);
      expect((executeResponse as any).payload.workflowId).toBeDefined();

      const workflowId = (executeResponse as any).payload.workflowId;

      // Step 5: Listen for real-time events
      const receivedEvents: any[] = [];
      const eventCollectionPromise = new Promise((resolve) => {
        let eventCount = 0;
        const maxEvents = 5; // Collect several events

        client.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === MessageType.EXECUTION_EVENT) {
            receivedEvents.push(message);
            eventCount++;

            if (eventCount >= maxEvents) {
              resolve(receivedEvents);
            }
          }
        });

        // Resolve after timeout if not enough events
        setTimeout(() => resolve(receivedEvents), 3000);
      });

      // Trigger some state changes to generate events
      await stateManager.updateWorkflowStatus(workflowId, 'RUNNING' as any);

      const events = await eventCollectionPromise;

      // Verify we received real-time events
      expect((events as any[]).length).toBeGreaterThan(0);

      // Step 6: Test workflow control
      client.send(JSON.stringify({
        id: 'pause-workflow',
        type: MessageType.PAUSE_WORKFLOW,
        timestamp: new Date(),
        payload: { workflowId },
      }));

      const pauseResponse = await new Promise((resolve) => {
        client.once('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.correlationId === 'pause-workflow') {
            resolve(message);
          }
        });
      });

      expect((pauseResponse as any).success).toBe(true);

      client.close();
    }, 10000);

    test('should handle multiple concurrent connections', async () => {
      const numConnections = 5;
      const clients: WebSocket[] = [];

      try {
        // Create multiple connections
        for (let i = 0; i < numConnections; i++) {
          const client = new WebSocket(`ws://localhost:${testPort}`);
          await new Promise((resolve) => client.once('open', resolve));
          clients.push(client);

          // Authenticate each client
          const connectRequest: ConnectRequest = {
            version: '2.0.0',
            clientId: `client-${i}`,
            capabilities: ['streaming'],
          };

          client.send(JSON.stringify({
            id: `connect-${i}`,
            type: MessageType.CONNECT,
            timestamp: new Date(),
            payload: connectRequest,
          }));

          await new Promise((resolve) => {
            client.once('message', resolve);
          });
        }

        // Verify all connections are active
        const metrics = integrationLayer.getMetrics();
        expect(metrics.connections.active).toBe(numConnections);

        // Test broadcast functionality
        await integrationLayer.broadcastMessage({
          id: 'broadcast-test',
          type: MessageType.EXECUTION_EVENT,
          timestamp: new Date(),
          event: 'test_broadcast',
          payload: { message: 'Hello all clients!' },
        });

        // Verify all clients receive the broadcast
        const responses = await Promise.all(
          clients.map(client =>
            new Promise((resolve) => {
              client.once('message', (data) => {
                resolve(JSON.parse(data.toString()));
              });
            })
          )
        );

        expect(responses.length).toBe(numConnections);
        responses.forEach(response => {
          expect((response as any).event).toBe('test_broadcast');
        });

      } finally {
        // Clean up connections
        clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.close();
          }
        });
      }
    });

    test('should integrate with Phase 1 state management', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.once('open', resolve));

      // Authenticate
      const connectRequest: ConnectRequest = {
        version: '2.0.0',
        clientId: 'state-test-client',
        capabilities: ['streaming'],
      };

      client.send(JSON.stringify({
        id: 'connect-state',
        type: MessageType.CONNECT,
        timestamp: new Date(),
        payload: connectRequest,
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      // Subscribe to state changes
      client.send(JSON.stringify({
        id: 'subscribe-state',
        type: MessageType.SUBSCRIBE,
        timestamp: new Date(),
        payload: {
          subscriptionType: SubscriptionType.STATE_CHANGES,
          filters: {},
          options: {},
        } as SubscribeRequest,
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      // Create workflow in state manager (Phase 1 component)
      const workflowId = await stateManager.createWorkflow({
        name: 'integration-test-workflow',
        description: 'Test workflow for integration',
        context: {},
        variables: { testVar: 'value' },
        metadata: { source: 'integration-test' },
      });

      // Should receive state change event
      const stateEvent = await new Promise((resolve) => {
        client.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === MessageType.EXECUTION_EVENT && message.event === 'state_changes') {
            resolve(message);
          }
        });

        // Trigger state change
        setTimeout(async () => {
          await stateManager.updateWorkflowStatus(workflowId, 'RUNNING' as any);
        }, 100);
      });

      expect(stateEvent).toBeDefined();
      expect((stateEvent as any).payload).toBeDefined();

      client.close();
    });

    test('should integrate with Phase 2 execution engine', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.once('open', resolve));

      // Authenticate
      const connectRequest: ConnectRequest = {
        version: '2.0.0',
        clientId: 'execution-test-client',
        capabilities: ['streaming'],
      };

      client.send(JSON.stringify({
        id: 'connect-execution',
        type: MessageType.CONNECT,
        timestamp: new Date(),
        payload: connectRequest,
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      // Subscribe to execution events
      client.send(JSON.stringify({
        id: 'subscribe-execution',
        type: MessageType.SUBSCRIBE,
        timestamp: new Date(),
        payload: {
          subscriptionType: SubscriptionType.WORKFLOW_EXECUTION,
          filters: {},
          options: {},
        } as SubscribeRequest,
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      // Create execution using Phase 2 execution engine
      const workflowId = 'execution-test-workflow';
      await executionEngine.createExecution(workflowId, {
        workflowId,
        variables: {},
        metadata: { source: 'integration-test' },
      });

      // Should receive execution event
      const executionEvent = await new Promise((resolve) => {
        client.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === MessageType.EXECUTION_EVENT) {
            resolve(message);
          }
        });
      });

      expect(executionEvent).toBeDefined();
      expect((executionEvent as any).payload).toBeDefined();

      client.close();
    });
  });

  describe('Hook Integration', () => {
    test('should execute hooks through WebSocket', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.once('open', resolve));

      // Authenticate
      const connectRequest: ConnectRequest = {
        version: '2.0.0',
        clientId: 'hook-test-client',
        capabilities: ['hooks'],
      };

      client.send(JSON.stringify({
        id: 'connect-hook',
        type: MessageType.CONNECT,
        timestamp: new Date(),
        payload: connectRequest,
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      // Execute built-in hook
      client.send(JSON.stringify({
        id: 'execute-hook',
        type: MessageType.HOOK_EXECUTE,
        timestamp: new Date(),
        payload: {
          hookName: 'user-prompt-submit',
          input: {
            prompt: 'Integration test prompt',
          },
          version: '2.0.0',
        },
      }));

      const hookResponse = await new Promise((resolve) => {
        client.once('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect((hookResponse as any).success).toBe(true);
      expect((hookResponse as any).payload.success).toBe(true);
      expect((hookResponse as any).payload.result.action).toBe('task_created');

      client.close();
    });

    test('should handle hook versioning', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.once('open', resolve));

      // Authenticate
      const connectRequest: ConnectRequest = {
        version: '1.0.0', // Old client version
        clientId: 'version-test-client',
        capabilities: ['hooks'],
      };

      client.send(JSON.stringify({
        id: 'connect-version',
        type: MessageType.CONNECT,
        timestamp: new Date(),
        payload: connectRequest,
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      // Execute hook with version compatibility
      client.send(JSON.stringify({
        id: 'execute-versioned-hook',
        type: MessageType.HOOK_EXECUTE,
        timestamp: new Date(),
        payload: {
          hookName: 'user-prompt-submit',
          input: {
            prompt: 'Version compatibility test',
          },
          version: '1.0.0', // Request old version
        },
      }));

      const hookResponse = await new Promise((resolve) => {
        client.once('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect((hookResponse as any).success).toBe(true);
      expect((hookResponse as any).payload.version).toBe('1.0.0');

      client.close();
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should handle connection failures gracefully', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.once('open', resolve));

      // Send malformed message
      client.send('invalid json message');

      const errorResponse = await new Promise((resolve) => {
        client.once('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect((errorResponse as any).type).toBe(MessageType.ERROR);
      expect((errorResponse as any).success).toBe(false);

      client.close();
    });

    test('should handle server restart gracefully', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.once('open', resolve));

      // Authenticate
      const connectRequest: ConnectRequest = {
        version: '2.0.0',
        clientId: 'restart-test-client',
        capabilities: ['streaming'],
      };

      client.send(JSON.stringify({
        id: 'connect-restart',
        type: MessageType.CONNECT,
        timestamp: new Date(),
        payload: connectRequest,
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      // Stop and restart integration layer
      await integrationLayer.stop();
      expect(integrationLayer.getStatus()).toBe(IntegrationStatus.STOPPED);

      await integrationLayer.start();
      expect(integrationLayer.getStatus()).toBe(IntegrationStatus.RUNNING);

      // Original client should be disconnected
      expect(client.readyState).toBe(WebSocket.CLOSED);

      // New connections should work
      const newClient = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => newClient.once('open', resolve));

      newClient.send(JSON.stringify({
        id: 'connect-after-restart',
        type: MessageType.CONNECT,
        timestamp: new Date(),
        payload: connectRequest,
      }));

      const response = await new Promise((resolve) => {
        newClient.once('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect((response as any).success).toBe(true);

      newClient.close();
    });

    test('should enforce rate limits when enabled', async () => {
      // Create integration layer with rate limiting enabled
      const rateLimitConfig = {
        ...config,
        websocket: {
          ...config.websocket,
          rateLimit: {
            enabled: true,
            maxRequestsPerMinute: 5,
            burstLimit: 2,
          },
        },
      };

      await integrationLayer.stop();
      integrationLayer = new IntegrationLayer(rateLimitConfig, {
        executionEngine,
        stateManager,
      });
      await integrationLayer.start();
      const wsServer = integrationLayer.getWebSocketServer().wsServer;
      const internalServer = (wsServer as any)._server || (wsServer as any).server;
      testPort = internalServer?.address?.()?.port || 8080;

      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.once('open', resolve));

      // Authenticate
      client.send(JSON.stringify({
        id: 'connect-rate-limit',
        type: MessageType.CONNECT,
        timestamp: new Date(),
        payload: {
          version: '2.0.0',
          clientId: 'rate-limit-client',
          capabilities: ['streaming'],
        } as ConnectRequest,
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      // Send multiple rapid requests
      const responses: any[] = [];
      for (let i = 0; i < 10; i++) {
        client.send(JSON.stringify({
          id: `ping-${i}`,
          type: MessageType.PING,
          timestamp: new Date(),
        }));
      }

      // Collect responses
      const responsePromise = new Promise((resolve) => {
        let count = 0;
        client.on('message', (data) => {
          responses.push(JSON.parse(data.toString()));
          count++;
          if (count >= 5) { // Expect some responses
            resolve(responses);
          }
        });
        setTimeout(() => resolve(responses), 1000);
      });

      await responsePromise;

      // Should have received some responses but not all due to rate limiting
      expect(responses.length).toBeGreaterThan(0);
      expect(responses.length).toBeLessThan(10);

      client.close();
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should collect comprehensive metrics', async () => {
      const initialMetrics = integrationLayer.getMetrics();

      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.once('open', resolve));

      // Authenticate
      client.send(JSON.stringify({
        id: 'connect-metrics',
        type: MessageType.CONNECT,
        timestamp: new Date(),
        payload: {
          version: '2.0.0',
          clientId: 'metrics-client',
          capabilities: ['streaming', 'hooks'],
        } as ConnectRequest,
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      // Perform various operations to generate metrics
      client.send(JSON.stringify({
        id: 'subscribe-metrics',
        type: MessageType.SUBSCRIBE,
        timestamp: new Date(),
        payload: {
          subscriptionType: SubscriptionType.EXECUTION_METRICS,
          filters: {},
          options: {},
        } as SubscribeRequest,
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      // Execute hook
      client.send(JSON.stringify({
        id: 'hook-metrics',
        type: MessageType.HOOK_EXECUTE,
        timestamp: new Date(),
        payload: {
          hookName: 'user-prompt-submit',
          input: { prompt: 'Metrics test' },
        },
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      const finalMetrics = integrationLayer.getMetrics();

      // Verify metrics were collected
      expect(finalMetrics.connections.total).toBeGreaterThan(initialMetrics.connections.total);
      expect(finalMetrics.connections.active).toBeGreaterThan(0);
      expect(finalMetrics.streams.subscriptions).toBeGreaterThan(initialMetrics.streams.subscriptions);
      expect(finalMetrics.hooks.executions).toBeGreaterThan(initialMetrics.hooks.executions);
      expect(finalMetrics.messages.received).toBeGreaterThan(initialMetrics.messages.received);
      expect(finalMetrics.messages.sent).toBeGreaterThan(initialMetrics.messages.sent);

      client.close();
    });

    test('should provide real-time metrics streaming', async () => {
      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.once('open', resolve));

      // Authenticate
      client.send(JSON.stringify({
        id: 'connect-metrics-stream',
        type: MessageType.CONNECT,
        timestamp: new Date(),
        payload: {
          version: '2.0.0',
          clientId: 'metrics-stream-client',
          capabilities: ['streaming'],
        } as ConnectRequest,
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      // Subscribe to metrics
      client.send(JSON.stringify({
        id: 'subscribe-metrics-stream',
        type: MessageType.SUBSCRIBE,
        timestamp: new Date(),
        payload: {
          subscriptionType: SubscriptionType.EXECUTION_METRICS,
          filters: {},
          options: {},
        } as SubscribeRequest,
      }));

      await new Promise((resolve) => {
        client.once('message', resolve);
      });

      // Should receive metrics events
      const metricsEvent = await new Promise((resolve) => {
        client.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === MessageType.EXECUTION_EVENT && message.event === 'execution_metrics') {
            resolve(message);
          }
        });

        // Trigger some activity to generate metrics
        setTimeout(() => {
          client.send(JSON.stringify({
            id: 'trigger-metrics',
            type: MessageType.PING,
            timestamp: new Date(),
          }));
        }, 100);
      });

      expect(metricsEvent).toBeDefined();
      expect((metricsEvent as any).payload).toBeDefined();

      client.close();
    });
  });
});