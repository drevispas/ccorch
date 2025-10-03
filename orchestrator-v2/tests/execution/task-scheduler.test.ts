import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TaskScheduler } from '../../core/execution/task-scheduler';
import { TaskPriority, ExecutableTask, TaskExecutionStatus } from '../../core/execution/types';

type TaskExecutor = (task: ExecutableTask) => Promise<any>;

describe('TaskScheduler', () => {
  let scheduler: TaskScheduler;
  let mockTaskExecutor: jest.MockedFunction<TaskExecutor>;

  beforeEach(() => {
    mockTaskExecutor = jest.fn<TaskExecutor>().mockResolvedValue({ result: 'success' });

    scheduler = new TaskScheduler({
      taskExecutor: mockTaskExecutor,
      workerPoolSize: 3,
      queueCapacity: 100,
      schedulingInterval: 50,
      enableDLQ: true,
      dlqMaxSize: 10,
      metricsInterval: 1000,
    });

    scheduler.start();
  });

  afterEach(async () => {
    await scheduler.shutdown(false); // Force shutdown for tests
  });

  describe('task scheduling', () => {
    test('should schedule a single task', () => {
      const task: ExecutableTask = {
        id: 'task-1',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
        params: { test: 'value' },
      };

      const taskId = scheduler.scheduleTask(task, TaskPriority.MEDIUM);

      expect(taskId).toBe('task-1');
      expect(scheduler.getQueueStats().length).toBe(1);
    });

    test('should schedule multiple tasks with different priorities', () => {
      // Stop scheduler to prevent immediate execution
      scheduler.stop();

      const tasks = [
        {
          id: 'task-low',
          stageId: 'stage-1',
          type: 'agent' as const,
          agentName: 'test-agent',
        },
        {
          id: 'task-high',
          stageId: 'stage-2',
          type: 'agent' as const,
          agentName: 'test-agent',
        },
        {
          id: 'task-critical',
          stageId: 'stage-3',
          type: 'agent' as const,
          agentName: 'test-agent',
        },
      ];

      scheduler.scheduleTask(tasks[0], TaskPriority.LOW);
      scheduler.scheduleTask(tasks[1], TaskPriority.HIGH);
      scheduler.scheduleTask(tasks[2], TaskPriority.CRITICAL);

      const stats = scheduler.getQueueStats();
      expect(stats.length).toBe(3);
      expect(stats.priorityDistribution[TaskPriority.LOW]).toBe(1);
      expect(stats.priorityDistribution[TaskPriority.HIGH]).toBe(1);
      expect(stats.priorityDistribution[TaskPriority.CRITICAL]).toBe(1);

      // Restart scheduler
      scheduler.start();
    });

    test('should execute tasks in priority order', async () => {
      const executedTasks: string[] = [];
      mockTaskExecutor.mockImplementation(async (task: ExecutableTask) => {
        executedTasks.push(task.id);
        return { result: 'success' };
      });

      // Schedule tasks in reverse priority order
      scheduler.scheduleTask({
        id: 'task-low',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      }, TaskPriority.LOW);

      scheduler.scheduleTask({
        id: 'task-critical',
        stageId: 'stage-2',
        type: 'agent',
        agentName: 'test-agent',
      }, TaskPriority.CRITICAL);

      scheduler.scheduleTask({
        id: 'task-high',
        stageId: 'stage-3',
        type: 'agent',
        agentName: 'test-agent',
      }, TaskPriority.HIGH);

      // Wait for execution
      await new Promise(resolve => setTimeout(resolve, 200));

      // Critical priority should execute first
      expect(executedTasks[0]).toBe('task-critical');
    });

    test('should handle task with deadline', () => {
      const deadline = new Date(Date.now() + 5000);
      const task: ExecutableTask = {
        id: 'task-with-deadline',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      };

      const taskId = scheduler.scheduleTask(
        task,
        TaskPriority.MEDIUM,
        deadline
      );

      expect(taskId).toBe('task-with-deadline');
    });

    test('should reject task when queue is full', () => {
      // Create scheduler with very small queue
      const smallScheduler = new TaskScheduler({
        taskExecutor: mockTaskExecutor,
        queueCapacity: 1,
      });

      const task1: ExecutableTask = {
        id: 'task-1',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      };

      const task2: ExecutableTask = {
        id: 'task-2',
        stageId: 'stage-2',
        type: 'agent',
        agentName: 'test-agent',
      };

      // First task should succeed
      expect(() => smallScheduler.scheduleTask(task1)).not.toThrow();

      // Second task should fail (queue full)
      expect(() => smallScheduler.scheduleTask(task2)).toThrow('Failed to enqueue task');

      smallScheduler.shutdown(false);
    });
  });

  describe('task execution', () => {
    test('should execute task successfully', async () => {
      const task: ExecutableTask = {
        id: 'success-task',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
        params: { input: 'test' },
      };

      let taskCompleted = false;
      scheduler.on('task:completed', ({ taskId }) => {
        if (taskId === 'success-task') {
          taskCompleted = true;
        }
      });

      scheduler.scheduleTask(task);

      // Wait for execution
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(taskCompleted).toBe(true);
      expect(mockTaskExecutor).toHaveBeenCalledWith(task);
    });

    test('should handle task execution failure', async () => {
      // Make it fail 3 times to trigger final failure
      mockTaskExecutor.mockRejectedValue(new Error('Task failed'));

      const task: ExecutableTask = {
        id: 'failing-task',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      };

      let taskFailed = false;
      let retryCount = 0;
      scheduler.on('task:failed', ({ taskId }) => {
        if (taskId === 'failing-task') {
          taskFailed = true;
        }
      });
      scheduler.on('task:retry', ({ taskId }) => {
        if (taskId === 'failing-task') {
          retryCount++;
        }
      });

      scheduler.scheduleTask(task);

      // Wait for execution and retries (3 attempts total)
      await new Promise(resolve => setTimeout(resolve, 400));

      expect(retryCount).toBe(2); // 2 retries after initial failure
      expect(taskFailed).toBe(true);
    });

    test('should track executing tasks', async () => {
      // Make task executor slow to see executing state
      mockTaskExecutor.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { result: 'success' };
      });

      const task: ExecutableTask = {
        id: 'slow-task',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      };

      scheduler.scheduleTask(task);

      // Check immediately - should be executing
      await new Promise(resolve => setTimeout(resolve, 50));

      const executingTasks = scheduler.getExecutingTasks();
      expect(executingTasks.size).toBeGreaterThan(0);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));

      const finalExecutingTasks = scheduler.getExecutingTasks();
      expect(finalExecutingTasks.size).toBe(0);
    });
  });

  describe('task control', () => {
    test('should cancel queued task', () => {
      const task: ExecutableTask = {
        id: 'cancel-task',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      };

      scheduler.scheduleTask(task);
      expect(scheduler.getQueueStats().length).toBe(1);

      const cancelled = scheduler.cancelTask('cancel-task');
      expect(cancelled).toBe(true);
      expect(scheduler.getQueueStats().length).toBe(0);
    });

    test('should reschedule task with new priority', () => {
      const task: ExecutableTask = {
        id: 'reschedule-task',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      };

      scheduler.scheduleTask(task, TaskPriority.LOW);

      const rescheduled = scheduler.rescheduleTask('reschedule-task', TaskPriority.HIGH);
      expect(rescheduled).toBe(true);
    });

    test('should reschedule task with delay', async () => {
      // Stop the scheduler to prevent automatic execution
      scheduler.stop();

      const task: ExecutableTask = {
        id: 'delayed-task',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      };

      scheduler.scheduleTask(task);

      const rescheduled = scheduler.rescheduleTask('delayed-task', TaskPriority.MEDIUM, 100);
      expect(rescheduled).toBe(true);

      // Task should not be in queue immediately
      expect(scheduler.getQueueStats().length).toBe(0);

      // Wait for delay
      await new Promise(resolve => setTimeout(resolve, 150));

      // Task should be back in queue
      expect(scheduler.getQueueStats().length).toBe(1);

      // Restart scheduler for cleanup
      scheduler.start();
    });
  });

  describe('dead letter queue', () => {
    test('should add failed tasks to DLQ after multiple failures', async () => {
      mockTaskExecutor.mockRejectedValue(new Error('Persistent failure'));

      const task: ExecutableTask = {
        id: 'dlq-task',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      };

      let dlqEvent = false;
      let failureCount = 0;
      scheduler.on('task:dlq', ({ taskId }) => {
        if (taskId === 'dlq-task') {
          dlqEvent = true;
        }
      });
      scheduler.on('task:retry', ({ taskId }) => {
        if (taskId === 'dlq-task') {
          failureCount++;
        }
      });

      scheduler.scheduleTask(task);

      // Wait for initial failure plus 2 retries (3 total attempts)
      // With scheduling interval of 50ms, we need to wait for multiple cycles
      await new Promise(resolve => setTimeout(resolve, 600));

      expect(failureCount).toBeGreaterThanOrEqual(2);
      expect(dlqEvent).toBe(true);
      expect(scheduler.getDeadLetterQueue().size).toBe(1);
    });

    test('should retry DLQ task', () => {
      // Manually add task to DLQ
      const dlqEntry = {
        task: {
          id: 'dlq-retry-task',
          stageId: 'stage-1',
          type: 'agent' as const,
          agentName: 'test-agent',
        },
        failures: [{ code: 'ERROR', message: 'Failed', retryable: true }],
        enqueuedAt: new Date(),
        lastAttemptAt: new Date(),
        attempts: 3,
      };

      scheduler.getDeadLetterQueue().set('dlq-retry-task', dlqEntry);

      const retried = scheduler.retryDLQTask('dlq-retry-task');
      expect(retried).toBe(true);
      expect(scheduler.getDeadLetterQueue().has('dlq-retry-task')).toBe(false);
    });

    test('should clear DLQ', () => {
      // Add some entries to DLQ
      const dlqEntry = {
        task: {
          id: 'clear-task',
          stageId: 'stage-1',
          type: 'agent' as const,
          agentName: 'test-agent',
        },
        failures: [],
        enqueuedAt: new Date(),
        lastAttemptAt: new Date(),
        attempts: 1,
      };

      scheduler.getDeadLetterQueue().set('clear-task', dlqEntry);
      expect(scheduler.getDeadLetterQueue().size).toBe(1);

      let clearEvent = false;
      scheduler.on('dlq:cleared', ({ count }) => {
        clearEvent = count === 1;
      });

      scheduler.clearDeadLetterQueue();
      expect(scheduler.getDeadLetterQueue().size).toBe(0);
      expect(clearEvent).toBe(true);
    });
  });

  describe('metrics and monitoring', () => {
    test('should provide queue statistics', () => {
      const tasks = [
        { id: 'task-1', stageId: 'stage-1', type: 'agent' as const, agentName: 'test-agent' },
        { id: 'task-2', stageId: 'stage-2', type: 'agent' as const, agentName: 'test-agent' },
      ];

      scheduler.scheduleTask(tasks[0], TaskPriority.HIGH);
      scheduler.scheduleTask(tasks[1], TaskPriority.LOW);

      const stats = scheduler.getQueueStats();
      expect(stats.length).toBe(2);
      expect(stats.priorityDistribution[TaskPriority.HIGH]).toBe(1);
      expect(stats.priorityDistribution[TaskPriority.LOW]).toBe(1);
    });

    test('should emit metrics events', (done) => {
      scheduler.on('metrics', (stats) => {
        expect(stats).toHaveProperty('length');
        expect(stats).toHaveProperty('priorityDistribution');
        done();
      });

      // Schedule a task to trigger metrics
      scheduler.scheduleTask({
        id: 'metrics-task',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      });
    });

    test('should get task status', () => {
      const task: ExecutableTask = {
        id: 'status-task',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      };

      scheduler.scheduleTask(task);

      const status = scheduler.getTaskStatus('status-task');
      expect(status).toBe(TaskExecutionStatus.QUEUED);

      const nonExistentStatus = scheduler.getTaskStatus('non-existent');
      expect(nonExistentStatus).toBeNull();
    });
  });

  describe('worker pool integration', () => {
    test('should scale workers based on queue load', async () => {
      // Schedule many tasks to trigger scaling
      for (let i = 0; i < 10; i++) {
        scheduler.scheduleTask({
          id: `scale-task-${i}`,
          stageId: `stage-${i}`,
          type: 'agent',
          agentName: 'test-agent',
        }, TaskPriority.HIGH);
      }

      // Wait for potential scaling
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have processed or be processing tasks
      expect(mockTaskExecutor).toHaveBeenCalled();
    });
  });

  describe('preemption', () => {
    test('should preempt lower priority task', async () => {
      // Schedule a long-running low priority task
      const longRunningExecutor = jest.fn<TaskExecutor>().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { result: 'success' };
      });

      const preemptableScheduler = new TaskScheduler({
        taskExecutor: longRunningExecutor,
        enablePreemption: true,
      });

      preemptableScheduler.start();

      const lowPriorityTask: ExecutableTask = {
        id: 'low-priority-task',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      };

      const highPriorityTask: ExecutableTask = {
        id: 'high-priority-task',
        stageId: 'stage-2',
        type: 'agent',
        agentName: 'test-agent',
      };

      preemptableScheduler.scheduleTask(lowPriorityTask, TaskPriority.LOW);

      // Wait a bit for low priority task to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Preempt with high priority task
      const preemptedTaskId = await preemptableScheduler.preemptTask(
        highPriorityTask,
        TaskPriority.CRITICAL
      );

      expect(preemptedTaskId).toBe('high-priority-task');

      await preemptableScheduler.shutdown(false);
    });

    test('should throw error when preemption is disabled', async () => {
      const task: ExecutableTask = {
        id: 'preempt-task',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      };

      await expect(scheduler.preemptTask(task)).rejects.toThrow(
        'Task preemption is not enabled'
      );
    });
  });

  describe('shutdown', () => {
    test('should shutdown gracefully', async () => {
      await expect(scheduler.shutdown(true)).resolves.toBeUndefined();
    });

    test('should stop scheduling after shutdown', async () => {
      await scheduler.shutdown();

      const task: ExecutableTask = {
        id: 'post-shutdown-task',
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test-agent',
      };

      // This should not execute since scheduler is shut down
      scheduler.scheduleTask(task);
    });
  });
});