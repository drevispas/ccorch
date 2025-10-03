import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AgentManager } from '../../core/plugins/agent-manager';
import { AgentPlugin, PluginExecutionContext } from '../../core/plugins/types';
import { AgentName, TaskId } from '../../core/state/types';
import { ComplexityLevel } from '../../core/workflow/types';

describe('AgentManager Extended Tests', () => {
  let agentManager: AgentManager;
  let mockPlugin: AgentPlugin;

  beforeEach(() => {
    // Don't use fake timers by default - only use them for specific tests
    agentManager = new AgentManager({
      maxConcurrentTasks: 5,
      taskTimeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000
    });

    mockPlugin = {
      manifest: {
        id: 'test-agent',
        name: 'Test Agent',
        version: '1.0.0',
        author: 'Test',
        description: 'Test agent plugin',
        capabilities: ['test-capability'],
        dependencies: {}
      },
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockResolvedValue({
        success: true,
        data: { result: 'test-result' }
      }),
      destroy: jest.fn().mockImplementation(() => Promise.resolve())
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    agentManager.destroy();
  });

  describe('Agent Registration', () => {
    it('should register agent with string capability', () => {
      const registered = agentManager.registerAgent(
        'string-capability-agent' as AgentName,
        mockPlugin,
        'test-capability'
      );

      expect(registered).toBe(true);
      const agents = agentManager.listAgents();
      expect(agents).toContain('string-capability-agent');
    });

    it('should register agent with array of capabilities', () => {
      const registered = agentManager.registerAgent(
        'array-capability-agent' as AgentName,
        mockPlugin,
        ['capability1', 'capability2']
      );

      expect(registered).toBe(true);
      const agents = agentManager.findAgentsByCapability('capability1');
      expect(agents).toContain('array-capability-agent');
      const agents2 = agentManager.findAgentsByCapability('capability2');
      expect(agents2).toContain('array-capability-agent');
    });

    it('should not register duplicate agent', () => {
      agentManager.registerAgent('duplicate-agent' as AgentName, mockPlugin);
      const registered = agentManager.registerAgent('duplicate-agent' as AgentName, mockPlugin);

      expect(registered).toBe(false);
    });

    it('should initialize agent if not already initialized', async () => {
      const uninitializedPlugin = {
        ...mockPlugin,
        isInitialized: false
      };

      agentManager.registerAgent('uninitialized-agent' as AgentName, uninitializedPlugin);
      expect(uninitializedPlugin.initialize).toHaveBeenCalled();
    });

    it('should unregister agent successfully', () => {
      agentManager.registerAgent('to-unregister' as AgentName, mockPlugin);
      const unregistered = agentManager.unregisterAgent('to-unregister' as AgentName);

      expect(unregistered).toBe(true);
      expect(agentManager.listAgents()).not.toContain('to-unregister');
    });

    it('should return false when unregistering non-existent agent', () => {
      const unregistered = agentManager.unregisterAgent('non-existent' as AgentName);
      expect(unregistered).toBe(false);
    });
  });

  describe('Task Execution', () => {
    beforeEach(() => {
      agentManager.registerAgent('test-agent' as AgentName, mockPlugin);
    });

    it('should execute task successfully', async () => {
      const result = await agentManager.executeTask(
        'task-1' as TaskId,
        'test-agent' as AgentName,
        'simple' as ComplexityLevel,
        { input: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'test-result' });
      expect(mockPlugin.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          task: expect.any(String),
          complexity: 'simple',
          parameters: { input: 'test' }
        })
      );
    });

    it('should handle execution failure', async () => {
      mockPlugin.execute = jest.fn().mockRejectedValue(new Error('Execution failed'));

      const result = await agentManager.executeTask(
        'task-2' as TaskId,
        'test-agent' as AgentName,
        'simple' as ComplexityLevel,
        { input: 'test' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Execution failed');
    });

    it('should handle non-existent agent', async () => {
      const result = await agentManager.executeTask(
        'task-3' as TaskId,
        'non-existent' as AgentName,
        'simple' as ComplexityLevel,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should track active executions', async () => {
      const execution = agentManager.executeTask(
        'task-4' as TaskId,
        'test-agent' as AgentName,
        'simple' as ComplexityLevel,
        {}
      );

      expect(agentManager.getActiveExecutions()).toContain('task-4');

      await execution;

      expect(agentManager.getActiveExecutions()).not.toContain('task-4');
    });

    it('should handle timeout correctly', async () => {
      let timeoutId: NodeJS.Timeout | undefined;
      mockPlugin.execute = jest.fn().mockImplementation(() =>
        new Promise(resolve => {
          timeoutId = setTimeout(resolve, 20000);
        })
      );

      const manager = new AgentManager({ taskTimeout: 100 });
      manager.registerAgent('timeout-agent' as AgentName, mockPlugin);

      const result = await manager.executeTask(
        'timeout-task' as TaskId,
        'timeout-agent' as AgentName,
        'simple' as ComplexityLevel,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');

      // Clean up the timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }, 10000);
  });

  describe('Concurrent Task Management', () => {
    beforeEach(() => {
      // Use fake timers for concurrent task tests
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should respect max concurrent tasks limit', async () => {
      const manager = new AgentManager({ maxConcurrentTasks: 2 });
      const slowPlugin = {
        ...mockPlugin,
        execute: jest.fn().mockImplementation(() =>
          new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
        )
      };

      manager.registerAgent('slow-agent' as AgentName, slowPlugin);

      // Start 3 tasks
      const task1 = manager.executeTask('task-1' as TaskId, 'slow-agent' as AgentName, 'simple' as ComplexityLevel, {});
      const task2 = manager.executeTask('task-2' as TaskId, 'slow-agent' as AgentName, 'simple' as ComplexityLevel, {});
      const task3 = manager.executeTask('task-3' as TaskId, 'slow-agent' as AgentName, 'simple' as ComplexityLevel, {});

      // First two should be active
      expect(manager.getActiveExecutions()).toContain('task-1');
      expect(manager.getActiveExecutions()).toContain('task-2');

      // Third should be blocked
      jest.advanceTimersByTime(0);
      const result3 = await task3;
      expect(result3.success).toBe(false);
      expect(result3.error).toContain('Maximum concurrent');

      // Complete first task
      jest.advanceTimersByTime(100);
      await task1;

      // Clean up
      jest.advanceTimersByTime(100);
      await task2;
    });

    it('should handle task cancellation', async () => {
      // Use real timers for this test
      jest.useRealTimers();

      let timeoutId: NodeJS.Timeout | null = null;
      const longRunningPlugin = {
        ...mockPlugin,
        execute: jest.fn().mockImplementation(() =>
          new Promise((resolve, reject) => {
            timeoutId = setTimeout(() => resolve({ success: true }), 10000);
          })
        )
      };

      agentManager.registerAgent('long-agent' as AgentName, longRunningPlugin);

      const taskPromise = agentManager.executeTask(
        'cancel-task' as TaskId,
        'long-agent' as AgentName,
        'simple' as ComplexityLevel,
        {}
      );

      // Wait a bit for the task to start
      await new Promise(resolve => setTimeout(resolve, 10));

      // Cancel the task
      const cancelled = agentManager.cancelTask('cancel-task' as TaskId);
      expect(cancelled).toBe(true);

      const result = await taskPromise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('cancelled');

      // Clean up the timeout
      if (timeoutId) clearTimeout(timeoutId);
    }, 10000);

    it('should return false when cancelling non-existent task', () => {
      const cancelled = agentManager.cancelTask('non-existent' as TaskId);
      expect(cancelled).toBe(false);
    });
  });

  describe('Agent Querying', () => {
    beforeEach(() => {
      agentManager.registerAgent('query-agent-1' as AgentName, mockPlugin, ['capability1', 'capability2']);
      agentManager.registerAgent('query-agent-2' as AgentName, mockPlugin, 'capability2');
    });

    it('should list all agents', () => {
      const agents = agentManager.listAgents();
      expect(agents).toContain('query-agent-1');
      expect(agents).toContain('query-agent-2');
    });

    it('should get agent by name', () => {
      const agent = agentManager.getAgent('query-agent-1' as AgentName);
      expect(agent).toBeDefined();
      expect(agent).toBe(mockPlugin);
    });

    it('should return undefined for non-existent agent', () => {
      const agent = agentManager.getAgent('non-existent' as AgentName);
      expect(agent).toBeUndefined();
    });

    it('should find agents by capability', () => {
      const agents1 = agentManager.findAgentsByCapability('capability1');
      expect(agents1).toContain('query-agent-1');
      expect(agents1).not.toContain('query-agent-2');

      const agents2 = agentManager.findAgentsByCapability('capability2');
      expect(agents2).toContain('query-agent-1');
      expect(agents2).toContain('query-agent-2');
    });

    it('should return empty array for unknown capability', () => {
      const agents = agentManager.findAgentsByCapability('unknown-capability');
      expect(agents).toEqual([]);
    });
  });

  describe('Metrics and Statistics', () => {
    beforeEach(() => {
      agentManager.registerAgent('metrics-agent' as AgentName, mockPlugin);
    });

    it('should track execution metrics', async () => {
      await agentManager.executeTask('m-task-1' as TaskId, 'metrics-agent' as AgentName, 'simple' as ComplexityLevel, {});
      await agentManager.executeTask('m-task-2' as TaskId, 'metrics-agent' as AgentName, 'simple' as ComplexityLevel, {});

      const metrics = agentManager.getMetrics();

      expect(metrics.totalExecutions).toBe(2);
      expect(metrics.successfulExecutions).toBe(2);
      expect(metrics.failedExecutions).toBe(0);
    });

    it('should track failed executions', async () => {
      mockPlugin.execute = jest.fn()
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Failed'));

      await agentManager.executeTask('f-task-1' as TaskId, 'metrics-agent' as AgentName, 'simple' as ComplexityLevel, {});
      await agentManager.executeTask('f-task-2' as TaskId, 'metrics-agent' as AgentName, 'simple' as ComplexityLevel, {});

      const metrics = agentManager.getMetrics();
      expect(metrics.totalExecutions).toBe(2);
      expect(metrics.successfulExecutions).toBe(1);
      expect(metrics.failedExecutions).toBe(1);
    });

    it('should calculate average execution time', async () => {
      const timeouts: NodeJS.Timeout[] = [];
      mockPlugin.execute = jest.fn().mockImplementation(() =>
        new Promise(resolve => {
          const timeout = setTimeout(() => resolve({ success: true }), 100);
          timeouts.push(timeout);
        })
      );

      await agentManager.executeTask('t-task-1' as TaskId, 'metrics-agent' as AgentName, 'simple' as ComplexityLevel, {});
      await agentManager.executeTask('t-task-2' as TaskId, 'metrics-agent' as AgentName, 'simple' as ComplexityLevel, {});

      const metrics = agentManager.getMetrics();
      expect(metrics.averageExecutionTime).toBeGreaterThanOrEqual(90);
      expect(metrics.averageExecutionTime).toBeLessThan(200);

      // Clean up any remaining timeouts
      timeouts.forEach(timeout => clearTimeout(timeout));
    }, 10000);

    it('should track per-agent metrics', async () => {
      await agentManager.executeTask('a-task-1' as TaskId, 'metrics-agent' as AgentName, 'simple' as ComplexityLevel, {});

      const agentMetrics = agentManager.getAgentMetrics('metrics-agent' as AgentName);

      expect(agentMetrics?.executions).toBe(1);
      expect(agentMetrics?.successes).toBe(1);
      expect(agentMetrics?.failures).toBe(0);
    });
  });

  describe('Error Recovery', () => {
    beforeEach(() => {
      agentManager = new AgentManager({
        retryAttempts: 3,
        retryDelay: 10
      });
      agentManager.registerAgent('retry-agent' as AgentName, mockPlugin);
    });

    it('should retry failed executions', async () => {
      let attempts = 0;
      mockPlugin.execute = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retry me');
        }
        return { success: true, data: { attempts } };
      });

      const result = await agentManager.executeTask(
        'retry-task' as TaskId,
        'retry-agent' as AgentName,
        'simple' as ComplexityLevel,
        {}
      );

      expect(result.success).toBe(true);
      expect(result.data.attempts).toBe(3);
      expect(attempts).toBe(3);
    }, 10000);

    it('should fail after max retry attempts', async () => {
      mockPlugin.execute = jest.fn().mockRejectedValue(new Error('Permanent failure'));

      const result = await agentManager.executeTask(
        'fail-task' as TaskId,
        'retry-agent' as AgentName,
        'simple' as ComplexityLevel,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permanent failure');
      expect(mockPlugin.execute).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    }, 10000);
  });

  describe('Lifecycle Management', () => {
    it('should destroy all agents on manager destroy', async () => {
      const plugin1 = { ...mockPlugin, destroy: jest.fn().mockImplementation(() => Promise.resolve()) };
      const plugin2 = { ...mockPlugin, destroy: jest.fn().mockImplementation(() => Promise.resolve()) };

      agentManager.registerAgent('lifecycle-agent-1' as AgentName, plugin1);
      agentManager.registerAgent('lifecycle-agent-2' as AgentName, plugin2);

      await agentManager.destroy();

      expect(plugin1.destroy).toHaveBeenCalled();
      expect(plugin2.destroy).toHaveBeenCalled();
    });

    it('should cancel all active tasks on destroy', async () => {
      // Track timeouts for cleanup
      const timeouts: NodeJS.Timeout[] = [];

      const slowPlugin = {
        ...mockPlugin,
        execute: jest.fn().mockImplementation(() =>
          new Promise(resolve => {
            const timeout = setTimeout(() => resolve({ success: true }), 10000);
            timeouts.push(timeout);
          })
        )
      };

      agentManager.registerAgent('destroy-agent' as AgentName, slowPlugin);

      // Start multiple tasks
      agentManager.executeTask('destroy-task-1' as TaskId, 'destroy-agent' as AgentName, 'simple' as ComplexityLevel, {});
      agentManager.executeTask('destroy-task-2' as TaskId, 'destroy-agent' as AgentName, 'simple' as ComplexityLevel, {});

      expect(agentManager.getActiveExecutions()).toHaveLength(2);

      await agentManager.destroy();

      expect(agentManager.getActiveExecutions()).toHaveLength(0);
      expect(slowPlugin.destroy).toHaveBeenCalled();

      // Clean up any remaining timeouts
      timeouts.forEach(timeout => clearTimeout(timeout));
    }, 10000);
  });
});