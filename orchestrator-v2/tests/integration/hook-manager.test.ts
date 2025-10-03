/**
 * Hook Manager Integration Tests
 *
 * Comprehensive tests for the hook management system including
 * hook registration, execution, versioning, and compatibility.
 */

import { HookManager } from '../../core/integration/hook-manager';
import {
  HookDefinition,
  HookImplementation,
  HookExecutionContext,
  HookRegistration,
  WebSocketConnection,
} from '../../core/integration/types';
import { z } from 'zod';
import { integrationTestSetup } from './test-utils';

// Setup integration test environment
integrationTestSetup();

// Mock WebSocket connection
const createMockConnection = (): WebSocketConnection => ({
  id: 'test-conn',
  socket: {} as any,
  sessionId: 'test-session',
  clientId: 'test-client',
  version: '2.0.0',
  capabilities: ['hooks'],
  connectedAt: new Date(),
  lastActivity: new Date(),
  subscriptions: new Map(),
  isAuthenticated: true,
  metadata: {
    remoteAddress: '127.0.0.1',
    userAgent: 'test-client',
  },
});

describe('Hook Manager Integration Tests', () => {
  let hookManager: HookManager;

  const config = {
    maxConcurrentExecutions: 10,
    executionTimeout: 5000,
    registrySize: 100,
    versioningEnabled: true,
    enableSandbox: false,
    allowedPackages: [],
    migrationEnabled: true,
  };

  beforeEach(() => {
    hookManager = new HookManager(config);
  });

  describe('Built-in Hook Registration', () => {
    test('should register built-in hooks', () => {
      const registeredHooks = hookManager.getRegisteredHooks();

      expect(registeredHooks).toContain('user-prompt-submit');
      expect(registeredHooks).toContain('task-completed');
      expect(registeredHooks).toContain('workflow-status-changed');
    });

    test('should have correct versions for built-in hooks', () => {
      const userPromptVersions = hookManager.getHookVersions('user-prompt-submit');

      expect(userPromptVersions).toContain('1.0.0');
      expect(userPromptVersions).toContain('2.0.0');
    });

    test('should set up compatibility matrix', () => {
      const matrix = hookManager.getCompatibilityMatrix();

      expect(matrix['user-prompt-submit']).toBeDefined();
      expect(matrix['user-prompt-submit'].latestVersion).toBe('2.0.0');
      expect(matrix['user-prompt-submit'].supportedVersions).toContain('1.0.0');
      expect(matrix['user-prompt-submit'].supportedVersions).toContain('2.0.0');
    });
  });

  describe('Custom Hook Registration', () => {
    test('should register custom hooks', () => {
      const definition: HookDefinition = {
        name: 'test-hook',
        version: '1.0.0',
        description: 'Test hook',
        inputSchema: z.object({
          message: z.string(),
        }),
        outputSchema: z.object({
          result: z.string(),
        }),
        metadata: {
          author: 'test-author',
          tags: ['test'],
        },
      };

      const implementation: HookImplementation = {
        definition,
        handler: async (input: any) => ({
          result: `Processed: ${input.message}`,
        }),
      };

      hookManager.registerHook(implementation);

      expect(hookManager.isHookRegistered('test-hook', '1.0.0')).toBe(true);
      expect(hookManager.getRegisteredHooks()).toContain('test-hook');
    });

    test('should reject invalid hook registrations', () => {
      const invalidDefinition = {
        name: '', // Invalid name
        version: 'invalid-version', // Invalid version
        description: 'Test hook',
      } as any;

      const implementation: HookImplementation = {
        definition: invalidDefinition,
        handler: async () => ({}),
      };

      expect(() => {
        hookManager.registerHook(implementation);
      }).toThrow();
    });

    test('should prevent hook registration from external requests for security', async () => {
      const connection = createMockConnection();
      const registration: HookRegistration = {
        name: 'external-hook',
        version: '1.0.0',
        implementation: {
          type: 'javascript',
          code: 'function handler() { return {}; }',
          entryPoint: 'handler',
        },
        metadata: {
          description: 'External hook',
          author: 'external',
          tags: [],
        },
      };

      await expect(
        hookManager.registerHookFromRequest(registration, connection)
      ).rejects.toThrow('User-defined hook registration not yet implemented for security reasons');
    });
  });

  describe('Hook Execution', () => {
    test('should execute built-in hooks successfully', async () => {
      const context: HookExecutionContext = {
        hookName: 'user-prompt-submit',
        executionId: 'test-exec',
        correlationId: 'test-corr',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      const result = await hookManager.executeHook(
        'user-prompt-submit',
        { prompt: 'Test prompt' },
        context,
        '2.0.0'
      );

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.result.action).toBe('task_created');
      expect(result.result.taskId).toBeDefined();
      expect(result.hookVersion).toBe('2.0.0');
    });

    test('should execute hooks with latest version when no version specified', async () => {
      const context: HookExecutionContext = {
        hookName: 'user-prompt-submit',
        executionId: 'test-exec',
        correlationId: 'test-corr',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      const result = await hookManager.executeHook(
        'user-prompt-submit',
        { prompt: 'Test prompt' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.hookVersion).toBe('2.0.0'); // Latest version
    });

    test('should handle hook execution errors', async () => {
      // Register a hook that throws an error
      const definition: HookDefinition = {
        name: 'error-hook',
        version: '1.0.0',
        description: 'Hook that throws error',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        metadata: {
          author: 'test',
          tags: [],
        },
      };

      const implementation: HookImplementation = {
        definition,
        handler: async () => {
          throw new Error('Test error');
        },
      };

      hookManager.registerHook(implementation);

      const context: HookExecutionContext = {
        hookName: 'error-hook',
        executionId: 'test-exec',
        correlationId: 'test-corr',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      const result = await hookManager.executeHook(
        'error-hook',
        {},
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Test error');
    });

    test('should enforce execution timeout', async () => {
      // Register a hook that takes too long
      const definition: HookDefinition = {
        name: 'slow-hook',
        version: '1.0.0',
        description: 'Slow hook',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        metadata: {
          author: 'test',
          tags: [],
        },
      };

      const implementation: HookImplementation = {
        definition,
        handler: async () => {
          await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
          return {};
        },
      };

      hookManager.registerHook(implementation);

      const context: HookExecutionContext = {
        hookName: 'slow-hook',
        executionId: 'test-exec',
        correlationId: 'test-corr',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      const result = await hookManager.executeHook(
        'slow-hook',
        {},
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    }, 10000);

    test('should enforce concurrent execution limits', async () => {
      const limitedConfig = { ...config, maxConcurrentExecutions: 1 };
      hookManager = new HookManager(limitedConfig);

      // Register a slow hook
      const definition: HookDefinition = {
        name: 'concurrent-hook',
        version: '1.0.0',
        description: 'Hook for testing concurrency',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        metadata: {
          author: 'test',
          tags: [],
        },
      };

      const implementation: HookImplementation = {
        definition,
        handler: async () => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return { success: true };
        },
      };

      hookManager.registerHook(implementation);

      const context1: HookExecutionContext = {
        hookName: 'concurrent-hook',
        executionId: 'test-exec-1',
        correlationId: 'test-corr-1',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      const context2: HookExecutionContext = {
        hookName: 'concurrent-hook',
        executionId: 'test-exec-2',
        correlationId: 'test-corr-2',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      // Start first execution (this should succeed)
      const execution1Promise = hookManager.executeHook('concurrent-hook', {}, context1);

      // Immediately start second execution (this should fail due to limit)
      const execution2Promise = hookManager.executeHook('concurrent-hook', {}, context2);

      const [result1, result2] = await Promise.all([execution1Promise, execution2Promise]);

      // One should succeed, one should fail
      const results = [result1, result2];
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(1);

      const failedResult = results.find(r => !r.success);
      expect(failedResult?.error).toContain('Maximum concurrent executions exceeded');
    });
  });

  describe('Hook Versioning and Compatibility', () => {
    test('should migrate input between versions', async () => {
      const context: HookExecutionContext = {
        hookName: 'user-prompt-submit',
        executionId: 'test-exec',
        correlationId: 'test-corr',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '1.0.0', // Client using old version
        },
      };

      // Execute with latest version but migrate from old version
      const result = await hookManager.executeHook(
        'user-prompt-submit',
        { prompt: 'Test prompt' },
        context,
        '2.0.0' // Target new version
      );

      expect(result.success).toBe(true);
      expect(result.hookVersion).toBe('2.0.0');
    });

    test('should handle non-existent hooks', async () => {
      const context: HookExecutionContext = {
        hookName: 'non-existent-hook',
        executionId: 'test-exec',
        correlationId: 'test-corr',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      const result = await hookManager.executeHook(
        'non-existent-hook',
        {},
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should check hook registration status', () => {
      expect(hookManager.isHookRegistered('user-prompt-submit')).toBe(true);
      expect(hookManager.isHookRegistered('user-prompt-submit', '2.0.0')).toBe(true);
      expect(hookManager.isHookRegistered('user-prompt-submit', '3.0.0')).toBe(false);
      expect(hookManager.isHookRegistered('non-existent-hook')).toBe(false);
    });
  });

  describe('Hook Middleware', () => {
    test('should execute global middleware', async () => {
      let middlewareExecuted = false;

      hookManager.addGlobalMiddleware({
        name: 'test-middleware',
        execute: async (input, context, next) => {
          middlewareExecuted = true;
          return await next();
        },
      });

      const context: HookExecutionContext = {
        hookName: 'user-prompt-submit',
        executionId: 'test-exec',
        correlationId: 'test-corr',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      await hookManager.executeHook(
        'user-prompt-submit',
        { prompt: 'Test prompt' },
        context
      );

      expect(middlewareExecuted).toBe(true);
    });

    test('should execute hook-specific middleware', async () => {
      let middlewareExecuted = false;

      hookManager.addHookMiddleware('user-prompt-submit', {
        name: 'hook-specific-middleware',
        execute: async (input, context, next) => {
          middlewareExecuted = true;
          return await next();
        },
      });

      const context: HookExecutionContext = {
        hookName: 'user-prompt-submit',
        executionId: 'test-exec',
        correlationId: 'test-corr',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      await hookManager.executeHook(
        'user-prompt-submit',
        { prompt: 'Test prompt' },
        context
      );

      expect(middlewareExecuted).toBe(true);
    });

    test('should transform input through middleware', async () => {
      hookManager.addGlobalMiddleware({
        name: 'input-transformer',
        execute: async (input, context, next) => {
          input.prompt = `[TRANSFORMED] ${input.prompt}`;
          return await next();
        },
      });

      const context: HookExecutionContext = {
        hookName: 'user-prompt-submit',
        executionId: 'test-exec',
        correlationId: 'test-corr',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      const result = await hookManager.executeHook(
        'user-prompt-submit',
        { prompt: 'Test prompt' },
        context
      );

      expect(result.success).toBe(true);
      // The transformed prompt should be used in the hook execution
    });
  });

  describe('Metrics and Observability', () => {
    test('should collect execution metrics', async () => {
      // Create a fresh HookManager instance for this test to avoid state pollution
      const testHookManager = new HookManager(config);

      const initialMetrics = testHookManager.getMetrics();

      const context: HookExecutionContext = {
        hookName: 'user-prompt-submit',
        executionId: 'test-exec',
        correlationId: 'test-corr',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      const result = await testHookManager.executeHook(
        'user-prompt-submit',
        { prompt: 'Test prompt' },
        context
      );

      // Wait for async observable updates
      await new Promise(resolve => setTimeout(resolve, 10));

      const newMetrics = testHookManager.getMetrics();

      expect(newMetrics.totalExecutions).toBe(initialMetrics.totalExecutions + 1);
      expect(newMetrics.successfulExecutions).toBe(initialMetrics.successfulExecutions + 1);
      expect(newMetrics.averageExecutionTime).toBeGreaterThan(0);
    });

    test('should emit observable events', (done) => {
      let eventReceived = false;

      hookManager.hookExecuted$.subscribe((result) => {
        eventReceived = true;
        expect(result.success).toBe(true);
        expect(result.metadata.hookName).toBe('user-prompt-submit');
        done();
      });

      const context: HookExecutionContext = {
        hookName: 'user-prompt-submit',
        executionId: 'test-exec',
        correlationId: 'test-corr',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      hookManager.executeHook(
        'user-prompt-submit',
        { prompt: 'Test prompt' },
        context
      );
    });

    test('should emit error events', (done) => {
      // Register a hook that throws an error
      const definition: HookDefinition = {
        name: 'error-observable-hook',
        version: '1.0.0',
        description: 'Hook for testing error observables',
        inputSchema: z.object({}),
        outputSchema: z.object({}),
        metadata: {
          author: 'test',
          tags: [],
        },
      };

      const implementation: HookImplementation = {
        definition,
        handler: async () => {
          throw new Error('Observable test error');
        },
      };

      hookManager.registerHook(implementation);

      hookManager.hookError$.subscribe((event) => {
        expect(event.hookName).toBe('error-observable-hook');
        expect(event.error.message).toContain('Observable test error');
        done();
      });

      const context: HookExecutionContext = {
        hookName: 'error-observable-hook',
        executionId: 'test-exec',
        correlationId: 'test-corr',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      hookManager.executeHook(
        'error-observable-hook',
        {},
        context
      );
    });
  });

  describe('Input Validation', () => {
    test('should validate hook input against schema', async () => {
      // Register a hook with strict input validation
      const definition: HookDefinition = {
        name: 'validated-hook',
        version: '1.0.0',
        description: 'Hook with input validation',
        inputSchema: z.object({
          requiredField: z.string().min(1),
          numberField: z.number().positive(),
        }),
        outputSchema: z.object({
          result: z.string(),
        }),
        metadata: {
          author: 'test',
          tags: [],
        },
      };

      const implementation: HookImplementation = {
        definition,
        handler: async (input) => ({
          result: `Processed: ${input.requiredField}`,
        }),
      };

      hookManager.registerHook(implementation);

      const context: HookExecutionContext = {
        hookName: 'validated-hook',
        executionId: 'test-exec',
        correlationId: 'test-corr',
        timestamp: new Date(),
        clientInfo: {
          sessionId: 'test-session',
          clientId: 'test-client',
          version: '2.0.0',
        },
      };

      // Test with invalid input
      const invalidResult = await hookManager.executeHook(
        'validated-hook',
        { requiredField: '', numberField: -1 }, // Invalid data
        context
      );

      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error).toContain('validation failed');

      // Test with valid input
      const validResult = await hookManager.executeHook(
        'validated-hook',
        { requiredField: 'valid', numberField: 42 },
        context
      );

      expect(validResult.success).toBe(true);
      expect(validResult.result.result).toBe('Processed: valid');
    });
  });
});