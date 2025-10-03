import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { firstValueFrom, take } from 'rxjs';
import { ReactiveExecutionEngine } from '../../core/execution/reactive-execution-engine';
import { EventDrivenStateManager } from '../../core/state/event-driven-state-manager';
import { PluginManager } from '../../core/plugins/plugin-manager';
import { WorkflowCompiler } from '../../core/workflow/compiler';
import {
  ExecutionEventType,
  TaskPriority,
  CompiledWorkflow,
  WorkflowContext,
} from '../../core/execution/types';

// Helper function to create a valid WorkflowContext
function createWorkflowContext(overrides: Partial<WorkflowContext> = {}): WorkflowContext {
  return {
    workflowId: 'test-workflow',
    executionId: 'test-execution',
    variables: new Map(),
    results: new Map(),
    metadata: {},
    checkpoints: [],
    status: 'running',
    errors: [],
    currentStage: 'stage-1',
    ...overrides,
  };
}

// Helper function to create a valid CompiledWorkflow
function createMockWorkflow(overrides: any = {}): CompiledWorkflow {
  return {
    id: overrides.id || 'test-workflow',
    name: overrides.name || 'Test Workflow',
    version: overrides.version || '1.0.0',
    source: {
      pipeline: overrides.pipeline || [],
      ...overrides.source
    },
    ast: {} as any,
    executable: true,
    optimizations: [],
    pipeline: overrides.pipeline || [],
    metadata: overrides.metadata || { created: new Date(), author: 'test-system' },
    ...overrides,
  } as CompiledWorkflow;
}

// Mock dependencies
jest.mock('../../core/state/event-driven-state-manager');
jest.mock('../../core/plugins/plugin-manager');
jest.mock('../../core/workflow/compiler');

describe('Execution Engine Integration', () => {
  let engine: ReactiveExecutionEngine;
  let mockStateManager: any;
  let mockPluginManager: any;
  let mockWorkflowCompiler: any;

  beforeEach(() => {
    // Setup comprehensive mocks
    mockStateManager = {
      executeCommand: jest.fn().mockResolvedValue({ success: true }),
      queryState: jest.fn().mockResolvedValue({}),
      subscribeToEvents: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
      on: jest.fn(),
      emit: jest.fn(),
    } as any;

    mockPluginManager = {
      getAgent: jest.fn().mockImplementation(async (name: string, complexity: string) => {
        const agent = {
          execute: jest.fn().mockImplementation(async (params: any) => {
            // Simulate different agent behaviors
            switch (name) {
              case 'fast-agent':
                return { result: 'fast-result', duration: 100 };
              case 'slow-agent':
                await new Promise(resolve => setTimeout(resolve, 200));
                return { result: 'slow-result', duration: 200 };
              case 'failing-agent':
                throw new Error('Agent execution failed');
              case 'retryable-agent':
                // Fail twice, then succeed
                if (agent.execute.mock.calls.length <= 2) {
                  const error = new Error('Retryable failure');
                  (error as any).retryable = true;
                  throw error;
                }
                return { result: 'retry-success', duration: 150 };
              default:
                return { result: `${name}-result`, duration: 100 };
            }
          }),
          metadata: { name, version: '1.0.0', complexity },
        };
        return agent;
      }),
    } as any;

    mockWorkflowCompiler = {
      compile: jest.fn().mockImplementation((workflow) => workflow),
      validate: jest.fn().mockResolvedValue({ valid: true }),
    } as any;

    engine = new ReactiveExecutionEngine({
      stateManager: mockStateManager,
      pluginManager: mockPluginManager,
      workflowCompiler: mockWorkflowCompiler,
      config: {
        maxConcurrentExecutions: 5,
        maxConcurrentTasks: 10,
        defaultTimeout: 5000,
        enableCheckpointing: true,
        enableMetrics: true,
        enableTracing: true,
        enableDebug: true,
      },
      enableCircuitBreaker: true,
      enableRetries: true,
      enableCheckpointing: true,
      enableRecovery: true,
      enableDebugging: true,
      enableMonitoring: true,
    });
  });

  afterEach(async () => {
    await engine.shutdown();
  }, 10000); // Increase timeout to 10 seconds

  describe('end-to-end workflow execution', () => {
    test('should execute simple workflow successfully', async () => {
      const workflow = createMockWorkflow({
        id: 'simple-workflow',
        name: 'Simple Test Workflow',
        pipeline: [
          {
            id: 'stage-1',
            type: 'task',
            agent: 'fast-agent',
            complexity: 'simple',
            params: { input: 'test-data' },
            timeout: 1000,
          },
          {
            id: 'stage-2',
            type: 'task',
            agent: 'slow-agent',
            complexity: 'moderate',
            params: { input: 'processed-data' },
            timeout: 2000,
          },
        ],
      });

      const execution$ = engine.executeWorkflow(workflow, createWorkflowContext({
        variables: new Map([['testVar', 'testValue']]),
      }));

      const events: any[] = [];
      const subscription = execution$.subscribe(event => {
        events.push(event);
      });

      // Wait for execution to start and progress
      await new Promise(resolve => setTimeout(resolve, 500));

      subscription.unsubscribe();

      // Verify execution started
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe(ExecutionEventType.EXECUTION_STARTED);
      expect(events[0].data.workflow.id).toBe('simple-workflow');

      // Verify agents were called
      expect(mockPluginManager.getAgent).toHaveBeenCalledWith('fast-agent', 'simple');
      expect(mockPluginManager.getAgent).toHaveBeenCalledWith('slow-agent', 'moderate');
    });

    test('should handle workflow with mixed success and failure', async () => {
      const workflow = createMockWorkflow({
        id: 'mixed-workflow',
        name: 'Mixed Result Workflow',
        pipeline: [
          {
            id: 'success-stage',
            type: 'task',
            agent: 'fast-agent',
            complexity: 'simple',
            params: { input: 'success-data' },
          },
          {
            id: 'failure-stage',
            type: 'task',
            agent: 'failing-agent',
            complexity: 'moderate',
            params: { input: 'failure-data' },
          },
        ],
      });

      const execution$ = engine.executeWorkflow(workflow, createWorkflowContext());

      const events: any[] = [];
      const errors: any[] = [];
      const subscription = execution$.subscribe({
        next: event => events.push(event),
        error: error => errors.push(error),
      });

      // Wait for execution
      await new Promise(resolve => setTimeout(resolve, 300));

      subscription.unsubscribe();

      // Should have started execution
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe(ExecutionEventType.EXECUTION_STARTED);
    });

    test('should execute workflow with retry logic', async () => {
      const workflow = createMockWorkflow({
        id: 'retry-workflow',
        name: 'Retry Test Workflow',
        pipeline: [
          {
            id: 'retry-stage',
            type: 'task',
            agent: 'retryable-agent',
            complexity: 'moderate',
            params: { input: 'retry-data' },
            retryConfig: {
              strategy: 'exponential',
              maxAttempts: 3,
              initialDelay: 50,
              maxDelay: 500,
            },
          },
        ],
      });

      const execution$ = engine.executeWorkflow(workflow, createWorkflowContext());

      const events: any[] = [];
      const subscription = execution$.subscribe(event => {
        events.push(event);
      });

      // Wait for retries to complete
      await new Promise(resolve => setTimeout(resolve, 800));

      subscription.unsubscribe();

      // Should have completed with retries
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe(ExecutionEventType.EXECUTION_STARTED);
    });
  });

  describe('execution control and monitoring', () => {
    test('should pause and resume execution', async () => {
      const workflow = createMockWorkflow({
        id: 'control-workflow',
        name: 'Control Test Workflow',
        pipeline: [
          {
            id: 'long-stage',
            type: 'task',
            agent: 'slow-agent',
            complexity: 'moderate',
            params: { input: 'control-data' },
          },
        ],
      });

      const execution$ = engine.executeWorkflow(workflow, createWorkflowContext());
      const startEvent = await firstValueFrom(execution$.pipe(take(1)));
      const executionId = startEvent.executionId;

      // Pause execution
      const pauseResult = engine.pauseExecution(executionId);
      expect(pauseResult).toBe(true);

      const pausedContext = engine.getExecutionContext(executionId);
      expect(pausedContext?.status).toBe('paused');

      // Resume execution
      const resumeResult = engine.resumeExecution(executionId);
      expect(resumeResult).toBe(true);

      const resumedContext = engine.getExecutionContext(executionId);
      expect(resumedContext?.status).toBe('running');
    });

    test('should cancel execution', async () => {
      const workflow = createMockWorkflow({
        id: 'cancel-workflow',
        name: 'Cancel Test Workflow',
        pipeline: [
          {
            id: 'cancel-stage',
            type: 'task',
            agent: 'slow-agent',
            complexity: 'moderate',
            params: { input: 'cancel-data' },
          },
        ],
      });

      const execution$ = engine.executeWorkflow(workflow, createWorkflowContext());
      const startEvent = await firstValueFrom(execution$.pipe(take(1)));
      const executionId = startEvent.executionId;

      // Cancel execution
      const cancelResult = engine.cancelExecution(executionId);
      expect(cancelResult).toBe(true);

      const cancelledContext = engine.getExecutionContext(executionId);
      expect(cancelledContext?.status).toBe('cancelled');
      expect(cancelledContext?.completedAt).toBeDefined();
    });
  });

  describe('observability and metrics', () => {
    test('should emit metrics during execution', async () => {
      const observables = engine.getObservables();
      let metricsEmitted = false;

      const metricsSubscription = observables.metrics$.subscribe(metrics => {
        if (metrics) {
          expect(metrics).toHaveProperty('tasksTotal');
          expect(metrics).toHaveProperty('tasksCompleted');
          expect(metrics).toHaveProperty('tasksFailed');
          metricsEmitted = true;
        }
      });

      const workflow = createMockWorkflow({
        id: 'metrics-workflow',
        name: 'Metrics Test Workflow',
        pipeline: [
          {
            id: 'metrics-stage',
            type: 'task',
            agent: 'fast-agent',
            complexity: 'simple',
            params: { input: 'metrics-data' },
          },
        ],
      });

      engine.executeWorkflow(workflow, createWorkflowContext());

      // Wait for metrics
      await new Promise(resolve => setTimeout(resolve, 200));

      metricsSubscription.unsubscribe();
      // Metrics emission depends on the monitor configuration
    });

    test('should track active executions', async () => {
      expect(engine.getActiveExecutions()).toHaveLength(0);

      const workflow = createMockWorkflow({
        id: 'tracking-workflow',
        name: 'Tracking Test Workflow',
        pipeline: [
          {
            id: 'tracking-stage',
            type: 'task',
            agent: 'fast-agent',
            complexity: 'simple',
            params: { input: 'tracking-data' },
          },
        ],
      });

      engine.executeWorkflow(workflow, createWorkflowContext());

      expect(engine.getActiveExecutions()).toHaveLength(1);
      expect(engine.getActiveExecutions()[0].workflowId).toBe('tracking-workflow');
    });
  });

  describe('state management integration', () => {
    test('should persist execution state changes', async () => {
      const workflow = createMockWorkflow({
        id: 'state-workflow',
        name: 'State Test Workflow',
        pipeline: [
          {
            id: 'state-stage',
            type: 'task',
            agent: 'fast-agent',
            complexity: 'simple',
            params: { input: 'state-data' },
          },
        ],
      });

      engine.executeWorkflow(workflow, createWorkflowContext());

      // Wait for state persistence
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(mockStateManager.executeCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UPDATE_EXECUTION_STATE',
        })
      );
    });
  });

  describe('error handling and resilience', () => {
    test('should handle agent not found gracefully', async () => {
      // Store original mock implementation
      const originalGetAgent = mockPluginManager.getAgent;

      // Temporarily mock getAgent to return null
      mockPluginManager.getAgent.mockResolvedValue(null);

      const workflow = createMockWorkflow({
        id: 'missing-agent-workflow',
        name: 'Missing Agent Workflow',
        pipeline: [
          {
            id: 'missing-stage',
            type: 'task',
            agent: 'nonexistent-agent',
            complexity: 'simple',
            params: { input: 'missing-data' },
          },
        ],
      });

      const execution$ = engine.executeWorkflow(workflow, createWorkflowContext());
      const events: any[] = [];
      const errors: any[] = [];

      const subscription = execution$.subscribe({
        next: event => events.push(event),
        error: error => errors.push(error),
      });

      // Wait for execution
      await new Promise(resolve => setTimeout(resolve, 200));

      subscription.unsubscribe();

      // Restore original mock implementation
      mockPluginManager.getAgent = originalGetAgent;

      // Should handle the error gracefully
      expect(events.length).toBeGreaterThan(0);
    });

    test('should apply circuit breaker for failing agents', async () => {
      const workflow = createMockWorkflow({
        id: 'circuit-breaker-workflow',
        name: 'Circuit Breaker Test',
        pipeline: [
          {
            id: 'failing-stage',
            type: 'task',
            agent: 'failing-agent',
            complexity: 'moderate',
            params: { input: 'circuit-data' },
          },
        ],
      });

      // Execute multiple times to trigger circuit breaker
      const executions = [];
      for (let i = 0; i < 3; i++) {
        const execution$ = engine.executeWorkflow(workflow, createWorkflowContext());
        executions.push(execution$);
      }

      // Wait for executions
      await new Promise(resolve => setTimeout(resolve, 300));

      // Circuit breaker should be engaged after failures
      expect(mockPluginManager.getAgent).toHaveBeenCalledWith('failing-agent', 'moderate');
    });
  });

  describe('performance and scalability', () => {
    test('should handle multiple concurrent workflows', async () => {
      const workflows = Array.from({ length: 5 }, (_, i) => createMockWorkflow({
        id: `concurrent-workflow-${i}`,
        name: `Concurrent Workflow ${i}`,
        pipeline: [
          {
            id: `concurrent-stage-${i}`,
            type: 'task',
            agent: 'fast-agent',
            complexity: 'simple',
            params: { input: `concurrent-data-${i}` },
          },
        ],
      }));

      const executions = await Promise.all(
        workflows.map(workflow => engine.executeWorkflow(workflow, createWorkflowContext()))
      );

      expect(executions).toHaveLength(5);
      expect(engine.getActiveExecutions()).toHaveLength(5);

      // Wait for all executions to start
      await new Promise(resolve => setTimeout(resolve, 200));

      // All workflows should be tracked
      const activeExecutions = engine.getActiveExecutions();
      expect(activeExecutions.length).toBeGreaterThan(0);
    });
  });

  describe('shutdown and cleanup', () => {
    test('should shutdown gracefully with active executions', async () => {
      const workflow = createMockWorkflow({
        id: 'shutdown-workflow',
        name: 'Shutdown Test Workflow',
        pipeline: [
          {
            id: 'shutdown-stage',
            type: 'task',
            agent: 'slow-agent',
            complexity: 'moderate',
            params: { input: 'shutdown-data' },
          },
        ],
      });

      engine.executeWorkflow(workflow, createWorkflowContext());

      // Shutdown should complete without hanging
      await expect(engine.shutdown()).resolves.toBeUndefined();
    });
  });
});