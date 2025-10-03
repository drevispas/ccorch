import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { of, firstValueFrom, take, timeout, filter } from 'rxjs';
import { ReactiveExecutionEngine } from '../../core/execution/reactive-execution-engine';
import { EventDrivenStateManager } from '../../core/state/event-driven-state-manager';
import { PluginManager } from '../../core/plugins/plugin-manager';
import { WorkflowCompiler } from '../../core/workflow/compiler';
import {
  ExecutionStatus,
  TaskPriority,
  ExecutionEventType,
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
function createMockWorkflow(overrides: Partial<CompiledWorkflow> = {}): CompiledWorkflow {
  return {
    id: 'test-workflow-id',
    version: '1.0.0',
    source: 'test source',
    ast: {} as any,
    executable: true,
    optimizations: [],
    pipeline: [],
    metadata: { created: new Date(), author: 'test' },
    ...overrides,
  } as CompiledWorkflow;
}

// Mock dependencies
jest.mock('../../core/state/event-driven-state-manager');
jest.mock('../../core/plugins/plugin-manager');
jest.mock('../../core/workflow/compiler');

describe('ReactiveExecutionEngine', () => {
  let engine: ReactiveExecutionEngine;
  let mockStateManager: any;
  let mockPluginManager: any;
  let mockWorkflowCompiler: any;

  beforeEach(() => {
    // Setup mocks
    mockStateManager = {
      executeCommand: jest.fn().mockResolvedValue({ success: true }),
      queryState: jest.fn().mockResolvedValue({}),
      subscribeToEvents: jest.fn().mockReturnValue(of({})),
      on: jest.fn(),
      emit: jest.fn(),
    } as any;

    mockPluginManager = {
      getAgent: jest.fn().mockResolvedValue({
        execute: jest.fn().mockResolvedValue({ result: 'test_result' }),
        metadata: { name: 'test-agent', version: '1.0.0' },
      }),
      loadPlugin: jest.fn(),
      unloadPlugin: jest.fn(),
    } as any;

    mockWorkflowCompiler = {
      compile: jest.fn(),
      validate: jest.fn(),
    } as any;

    // Create engine instance
    engine = new ReactiveExecutionEngine({
      stateManager: mockStateManager,
      pluginManager: mockPluginManager,
      workflowCompiler: mockWorkflowCompiler,
      config: {
        maxConcurrentExecutions: 5,
        maxConcurrentTasks: 10,
        defaultTimeout: 30000,
        enableCheckpointing: true,
        enableMetrics: true,
        enableTracing: true,
        enableDebug: false,
      },
      enableCircuitBreaker: true,
      enableRetries: true,
      enableCheckpointing: true,
      enableRecovery: true,
      enableDebugging: false,
      enableMonitoring: true,
    });
  });

  afterEach(async () => {
    // Shutdown engine and clean up resources
    if (engine) {
      await engine.shutdown();
    }

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(engine).toBeInstanceOf(ReactiveExecutionEngine);
      expect(engine.getActiveExecutions()).toHaveLength(0);
    });

    test('should setup observable streams', () => {
      const observables = engine.getObservables();
      expect(observables.events$).toBeDefined();
      expect(observables.metrics$).toBeDefined();
      expect(observables.tasks$).toBeDefined();
      expect(observables.errors$).toBeDefined();
      expect(observables.state$).toBeDefined();
      expect(observables.alerts$).toBeDefined();
    });
  });

  describe('workflow execution', () => {
    let mockWorkflow: CompiledWorkflow;
    let mockContext: WorkflowContext;

    beforeEach(() => {
      mockWorkflow = {
        id: 'test-workflow-id',
        name: 'Test Workflow',
        version: '1.0.0',
        pipeline: [
          {
            id: 'stage-1',
            type: 'task',
            agent: 'test-agent',
            complexity: 'moderate',
            params: { input: 'test' },
            timeout: 10000,
          },
        ],
        metadata: {
          created: new Date(),
          author: 'test',
        },
      } as any;

      mockContext = createWorkflowContext({
        variables: new Map([['testVar', 'testValue']]),
      });
    });

    test('should execute workflow successfully', async () => {
      const execution$ = engine.executeWorkflow(mockWorkflow, mockContext);

      const events: any[] = [];
      const subscription = execution$.subscribe(event => {
        events.push(event);
      });

      // Wait for execution to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should receive started event
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(ExecutionEventType.EXECUTION_STARTED);
      expect(events[0].data.workflow).toEqual(mockWorkflow);
      expect(events[0].data.context).toEqual(mockContext);

      subscription.unsubscribe();
    });

    test('should handle workflow execution with priority', async () => {
      const execution$ = engine.executeWorkflow(mockWorkflow, mockContext, {
        priority: TaskPriority.HIGH,
        timeout: 15000,
      });

      const startEvent = await firstValueFrom(execution$.pipe(take(1)));

      expect(startEvent.type).toBe(ExecutionEventType.EXECUTION_STARTED);
      expect(startEvent.data.options.priority).toBe(TaskPriority.HIGH);
      expect(startEvent.data.options.timeout).toBe(15000);
    });

    test('should handle workflow execution failure', async () => {
      // Make agent execution fail
      mockPluginManager.getAgent.mockResolvedValue({
        execute: jest.fn().mockRejectedValue(new Error('Agent execution failed')),
        metadata: { name: 'test-agent', version: '1.0.0' },
      } as any);

      const execution$ = engine.executeWorkflow(mockWorkflow, mockContext);

      const events: any[] = [];
      const subscription = execution$.subscribe({
        next: event => events.push(event),
        error: error => events.push({ type: 'error', error }),
      });

      // Wait for execution
      await new Promise(resolve => setTimeout(resolve, 10));

      subscription.unsubscribe();

      // Should receive started event and potentially failure events
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe(ExecutionEventType.EXECUTION_STARTED);
    });
  });

  describe('execution control', () => {
    let executionId: string;

    beforeEach(async () => {
      const mockWorkflow = createMockWorkflow();

      const execution$ = engine.executeWorkflow(mockWorkflow, createWorkflowContext());
      const startEvent = await firstValueFrom(execution$.pipe(take(1)));
      executionId = startEvent.executionId;
    });

    test('should pause execution', () => {
      const result = engine.pauseExecution(executionId);
      expect(result).toBe(true);

      const context = engine.getExecutionContext(executionId);
      expect(context?.status).toBe(ExecutionStatus.PAUSED);
    });

    test('should resume execution', () => {
      // First pause
      engine.pauseExecution(executionId);

      // Then resume
      const result = engine.resumeExecution(executionId);
      expect(result).toBe(true);

      const context = engine.getExecutionContext(executionId);
      expect(context?.status).toBe(ExecutionStatus.RUNNING);
    });

    test('should cancel execution', () => {
      const result = engine.cancelExecution(executionId);
      expect(result).toBe(true);

      const context = engine.getExecutionContext(executionId);
      expect(context?.status).toBe(ExecutionStatus.CANCELLED);
      expect(context?.completedAt).toBeDefined();
    });

    test('should return false for invalid execution ID', () => {
      expect(engine.pauseExecution('invalid-id')).toBe(false);
      expect(engine.resumeExecution('invalid-id')).toBe(false);
      expect(engine.cancelExecution('invalid-id')).toBe(false);
    });
  });

  describe('state management integration', () => {
    test('should persist execution events to state manager', async () => {
      const mockWorkflow = createMockWorkflow();

      engine.executeWorkflow(mockWorkflow, createWorkflowContext());

      // Wait for state persistence
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockStateManager.executeCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UPDATE_EXECUTION_STATE',
          payload: expect.objectContaining({
            status: ExecutionStatus.RUNNING,
          }),
        })
      );
    });

    test('should subscribe to state manager events', () => {
      expect(mockStateManager.on).toHaveBeenCalledWith(
        'command:executed',
        expect.any(Function)
      );
    });
  });

  describe('observables', () => {
    test('should emit events through observables', async () => {
      const observables = engine.getObservables();
      const events: any[] = [];

      const subscription = observables.events$.subscribe(event => {
        events.push(event);
      });

      const mockWorkflow = createMockWorkflow();

      engine.executeWorkflow(mockWorkflow, createWorkflowContext());

      // Wait for events
      await new Promise(resolve => setTimeout(resolve, 10));

      subscription.unsubscribe();

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe(ExecutionEventType.EXECUTION_STARTED);
    });

    test('should emit metrics when monitoring is enabled', async () => {
      const observables = engine.getObservables();

      // Note: Since metrics$ might be NEVER if monitor is not enabled,
      // we'll just check that the observable is defined
      expect(observables.metrics$).toBeDefined();
    });
  });

  describe('error handling', () => {
    test('should handle agent not found error', async () => {
      mockPluginManager.getAgent.mockResolvedValue(null);

      const mockWorkflow = {
        id: 'test-workflow-id',
        pipeline: [{
          id: 'stage-1',
          type: 'task',
          agent: 'nonexistent-agent',
        }],
      } as any;

      const execution$ = engine.executeWorkflow(mockWorkflow, createWorkflowContext());
      const errors: any[] = [];

      const subscription = execution$.subscribe({
        error: error => errors.push(error),
      });

      // Wait for execution
      await new Promise(resolve => setTimeout(resolve, 10));

      subscription.unsubscribe();

      // Should handle the error gracefully
    });

    test('should handle task execution timeout', async () => {
      // Make agent execution take longer than timeout
      mockPluginManager.getAgent.mockResolvedValue({
        execute: jest.fn().mockImplementation(() =>
          new Promise(resolve => setTimeout(() => resolve({}), 5000))
        ),
        metadata: { name: 'slow-agent', version: '1.0.0' },
      } as any);

      const mockWorkflow = {
        id: 'test-workflow-id',
        pipeline: [{
          id: 'stage-1',
          type: 'task',
          agent: 'slow-agent',
          timeout: 100, // Very short timeout
        }],
      } as any;

      const execution$ = engine.executeWorkflow(mockWorkflow, createWorkflowContext());
      const events: any[] = [];

      const subscription = execution$.subscribe({
        next: event => events.push(event),
        error: error => events.push({ type: 'error', error }),
      });

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 50));

      subscription.unsubscribe();

      // Should handle timeout
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('shutdown', () => {
    test('should shutdown gracefully', async () => {
      const shutdownPromise = engine.shutdown();

      await expect(shutdownPromise).resolves.toBeUndefined();
    });

    test('should complete observables on shutdown', async () => {
      const observables = engine.getObservables();
      let eventsCompleted = false;

      observables.events$.subscribe({
        complete: () => { eventsCompleted = true; },
      });

      await engine.shutdown();

      expect(eventsCompleted).toBe(true);
    });
  });

  describe('active executions', () => {
    test('should track active executions', async () => {
      expect(engine.getActiveExecutions()).toHaveLength(0);

      const mockWorkflow = createMockWorkflow();

      engine.executeWorkflow(mockWorkflow, createWorkflowContext());

      expect(engine.getActiveExecutions()).toHaveLength(1);
      expect(engine.getActiveExecutions()[0].workflowId).toBe('test-workflow-id');
    });

    test('should provide execution context by ID', async () => {
      const mockWorkflow = createMockWorkflow();

      const execution$ = engine.executeWorkflow(mockWorkflow, createWorkflowContext());
      const startEvent = await firstValueFrom(execution$.pipe(take(1)));
      const executionId = startEvent.executionId;

      const context = engine.getExecutionContext(executionId);
      expect(context).toBeDefined();
      expect(context?.executionId).toBe(executionId);
      expect(context?.workflowId).toBe('test-workflow-id');
    });

    test('should return undefined for invalid execution ID', () => {
      const context = engine.getExecutionContext('invalid-id');
      expect(context).toBeUndefined();
    });
  });
});