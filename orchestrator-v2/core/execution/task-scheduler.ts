import { EventEmitter } from 'events';
import { Observable, Subject, BehaviorSubject, interval, merge } from 'rxjs';
import { filter, map, takeUntil, throttleTime } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import {
  ExecutableTask,
  PrioritizedTask,
  TaskPriority,
  TaskExecution,
  TaskExecutionStatus,
  TaskError,
  ResourceRequirements,
  QueueStats,
  DLQEntry,
  SchedulerConfig,
  Worker,
} from './types';
import { MultiLevelPriorityQueue } from './utils/priority-queue';
import { WorkerPoolManager, TaskExecutor } from './utils/worker-pool';

export interface TaskSchedulerOptions extends Partial<SchedulerConfig> {
  taskExecutor: TaskExecutor;
  enableDLQ?: boolean;
  dlqMaxSize?: number;
  metricsInterval?: number;
}

export class TaskScheduler extends EventEmitter {
  private taskQueue: MultiLevelPriorityQueue;
  private workerPool: WorkerPoolManager;
  private deadLetterQueue: Map<string, DLQEntry> = new Map();
  private executingTasks: Map<string, TaskExecution> = new Map();
  private taskAffinityMap: Map<string, string> = new Map(); // taskId -> workerId
  private config: Required<SchedulerConfig>;
  private isRunning: boolean = false;
  private schedulingTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private shutdown$ = new Subject<void>();
  private metrics$ = new BehaviorSubject<QueueStats | null>(null);
  private enableDLQ: boolean;
  private dlqMaxSize: number;
  private taskRegistry: Map<string, { task: ExecutableTask; priority: TaskPriority }> = new Map();

  constructor(options: TaskSchedulerOptions) {
    super();

    this.config = {
      workerPoolSize: options.workerPoolSize ?? 5,
      queueCapacity: options.queueCapacity ?? 1000,
      schedulingInterval: options.schedulingInterval ?? 100,
      priorityLevels: options.priorityLevels ?? 5,
      enableAffinity: options.enableAffinity ?? false,
      enablePreemption: options.enablePreemption ?? false,
      resourceTracking: options.resourceTracking ?? false,
      loadBalancing: options.loadBalancing ?? 'round_robin',
    };

    this.enableDLQ = options.enableDLQ ?? true;
    this.dlqMaxSize = options.dlqMaxSize ?? 100;

    // Initialize task queue
    this.taskQueue = new MultiLevelPriorityQueue(this.config.queueCapacity);

    // Initialize worker pool
    this.workerPool = new WorkerPoolManager(options.taskExecutor, {
      minWorkers: Math.floor(this.config.workerPoolSize / 2),
      maxWorkers: this.config.workerPoolSize,
      autoScale: true,
      resourceTracking: this.config.resourceTracking,
    });

    // Set up event listeners
    this.setupEventListeners();

    // Start metrics collection if specified
    if (options.metricsInterval) {
      this.startMetricsCollection(options.metricsInterval);
    }
  }

  public async initialize(): Promise<void> {
    // TaskScheduler is initialized in constructor
    // This method is provided for interface compatibility
  }

  private setupEventListeners(): void {
    this.workerPool.on('task:completed', ({ task, result }) => {
      this.handleTaskCompletion(task.id, result);
    });

    this.workerPool.on('task:failed', ({ task, error }) => {
      this.handleTaskFailure(task.id, error);
    });

    this.workerPool.on('worker:failed', (worker: Worker) => {
      this.handleWorkerFailure(worker);
    });
  }

  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.emit('scheduler:started');

    // Start scheduling loop
    this.schedulingTimer = setInterval(() => {
      this.scheduleNextBatch();
    }, this.config.schedulingInterval);
    // Allow Node.js to exit even if timer is active
    if (this.schedulingTimer.unref) {
      this.schedulingTimer.unref();
    }
  }

  public stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.schedulingTimer) {
      clearInterval(this.schedulingTimer);
      this.schedulingTimer = undefined;
    }

    this.emit('scheduler:stopped');
  }

  public async shutdown(graceful: boolean = true): Promise<void> {
    this.stop();

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    this.shutdown$.next();
    this.shutdown$.complete();

    if (graceful) {
      // Wait only for actively running tasks to finish
      await this.waitForTasks();
    }

    // Flush any queued or pending work that will no longer run
    this.taskQueue.clear();
    this.cleanupInactiveTasks();

    await this.workerPool.shutdown(graceful);
    this.emit('scheduler:shutdown');
  }

  private async waitForTasks(timeout: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (this.hasActiveTasks()) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Task completion timeout');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private hasActiveTasks(): boolean {
    for (const execution of this.executingTasks.values()) {
      if (
        execution.status === TaskExecutionStatus.RUNNING ||
        execution.status === TaskExecutionStatus.PENDING ||
        execution.status === TaskExecutionStatus.RETRYING
      ) {
        return true;
      }
    }
    return false;
  }

  private cleanupInactiveTasks(): void {
    for (const [taskId, execution] of Array.from(this.executingTasks.entries())) {
      if (
        execution.status !== TaskExecutionStatus.RUNNING &&
        execution.status !== TaskExecutionStatus.PENDING &&
        execution.status !== TaskExecutionStatus.RETRYING
      ) {
        this.executingTasks.delete(taskId);
        this.taskAffinityMap.delete(taskId);
        this.taskRegistry.delete(taskId);
      }
    }
  }

  public scheduleTask(
    task: ExecutableTask,
    priority: TaskPriority = TaskPriority.MEDIUM,
    deadline?: Date,
    affinity?: string,
    resourceRequirements?: ResourceRequirements
  ): string {
    const taskId = task.id || uuidv4();

    const prioritizedTask: PrioritizedTask = {
      id: taskId,
      priority,
      task,
      enqueuedAt: new Date(),
      deadline,
      affinity,
      resourceRequirements,
    };

    // Check if queue is full
    if (this.taskQueue.isFull()) {
      const error: TaskError = {
        code: 'QUEUE_FULL',
        message: 'Failed to enqueue task',
        retryable: true,
      };
      this.emit('task:rejected', { taskId, error });
      throw new Error(error.message);
    }

    // Handle task affinity if enabled
    if (this.config.enableAffinity && affinity) {
      this.taskAffinityMap.set(taskId, affinity);
    }

    // Store task in registry for later retrieval
    this.taskRegistry.set(taskId, { task, priority });

    // Add to queue
    const success = this.taskQueue.enqueue(prioritizedTask);

    if (success) {
      this.emit('task:queued', {
        taskId,
        priority,
        queuePosition: this.taskQueue.size(),
      });

      // Trigger immediate scheduling if high priority
      if (priority === TaskPriority.CRITICAL && this.isRunning) {
        this.scheduleNextBatch();
      }

      return taskId;
    } else {
      // Clean up registry if enqueue failed
      this.taskRegistry.delete(taskId);
      throw new Error('Failed to enqueue task');
    }
  }

  public scheduleTasks(
    tasks: ExecutableTask[],
    priority: TaskPriority = TaskPriority.MEDIUM
  ): string[] {
    const taskIds: string[] = [];

    for (const task of tasks) {
      const taskId = this.scheduleTask(task, priority);
      taskIds.push(taskId);
    }

    return taskIds;
  }

  private scheduleNextBatch(): void {
    if (!this.isRunning) return;

    const workerCount = this.workerPool.getWorkerCount();
    const availableWorkers = workerCount.idle;

    if (availableWorkers === 0) return;

    // Get tasks to schedule
    const tasksToSchedule = Math.min(availableWorkers, this.taskQueue.size());

    for (let i = 0; i < tasksToSchedule; i++) {
      const task = this.taskQueue.dequeue();
      if (!task) break;

      this.executeTask(task);
    }
  }

  private async executeTask(prioritizedTask: PrioritizedTask): Promise<void> {
    const { task, id: taskId } = prioritizedTask;

    // Get existing execution (for retries) or create new one
    let execution = this.executingTasks.get(taskId);
    const isRetry = !!execution;

    if (!execution) {
      execution = {
        taskId,
        executionId: uuidv4(),
        status: TaskExecutionStatus.RUNNING,
        attempts: 1,
        metrics: {
          startTime: Date.now(),
          queueTime: Date.now() - prioritizedTask.enqueuedAt.getTime(),
          attempts: 1,
          retries: 0,
          executionTime: 0,
        },
      };
      this.executingTasks.set(taskId, execution);
    } else {
      // This is a retry - don't increment attempts here, it was done in handleTaskFailure
      execution.status = TaskExecutionStatus.RUNNING;
    }

    this.emit('task:started', { taskId, execution });

    try {
      // Execute through worker pool
      const result = await this.workerPool.executeTask(task);
      execution.result = result.result;
      execution.status = TaskExecutionStatus.COMPLETED;

      if (execution.metrics && result.metrics) {
        execution.metrics.executionTime = result.metrics.executionTime;
        execution.metrics.endTime = result.metrics.endTime;
      }

      this.handleTaskCompletion(taskId, result);
    } catch (error) {
      this.handleTaskFailure(taskId, error);
    }
  }

  private handleTaskCompletion(taskId: string, result: any): void {
    const execution = this.executingTasks.get(taskId);
    if (!execution) return;

    execution.status = TaskExecutionStatus.COMPLETED;
    execution.result = result;

    this.executingTasks.delete(taskId);
    this.taskAffinityMap.delete(taskId);
    this.taskRegistry.delete(taskId);

    this.emit('task:completed', { taskId, execution, result });
  }

  private handleTaskFailure(taskId: string, error: any): void {
    const execution = this.executingTasks.get(taskId);
    if (!execution) return;

    const taskError: TaskError = {
      code: error.code || 'EXECUTION_ERROR',
      message: error.message || String(error),
      stack: error.stack,
      retryable: error.retryable ?? true,
    };

    execution.status = TaskExecutionStatus.FAILED;
    execution.error = taskError;

    // Check if we should retry or move to DLQ
    if (taskError.retryable && execution.attempts < 3) {
      // Retry the task
      const taskInfo = this.taskRegistry.get(taskId);
      if (taskInfo) {
        // Increment attempts for next try
        execution.attempts++;

        // Update metrics
        if (execution.metrics) {
          execution.metrics.retries++;
          execution.metrics.attempts = execution.attempts;
        }

        // Re-schedule with same priority
        const prioritizedTask: PrioritizedTask = {
          id: taskId,
          priority: taskInfo.priority,
          task: taskInfo.task,
          enqueuedAt: new Date(),
        };
        this.taskQueue.enqueue(prioritizedTask);

        // Update status to queued but don't remove from executing map
        execution.status = TaskExecutionStatus.QUEUED;

        this.emit('task:retry', { taskId, attempt: execution.attempts - 1 }); // attempt is the just-failed attempt
        return;
      }
    }

    this.executingTasks.delete(taskId);

    // Add to dead letter queue if enabled and max attempts reached
    if (this.enableDLQ && execution.attempts >= 3) {
      this.addToDeadLetterQueue(taskId, execution);
    }

    // Clean up task registry
    this.taskRegistry.delete(taskId);

    this.emit('task:failed', { taskId, execution, error: taskError });
  }

  private handleWorkerFailure(worker: Worker): void {
    // Requeue task if worker had one
    if (worker.currentTask) {
      const execution = this.executingTasks.get(worker.currentTask);
      if (execution) {
        execution.status = TaskExecutionStatus.QUEUED;
        execution.attempts++;

        // Requeue with higher priority
        const task = this.findTaskById(worker.currentTask);
        if (task) {
          this.scheduleTask(task, TaskPriority.HIGH);
        }
      }
    }

    this.emit('worker:failed', worker);
  }

  private findTaskById(taskId: string): ExecutableTask | undefined {
    const taskInfo = this.taskRegistry.get(taskId);
    return taskInfo?.task;
  }

  private addToDeadLetterQueue(taskId: string, execution: TaskExecution): void {
    if (this.deadLetterQueue.size >= this.dlqMaxSize) {
      // Remove oldest entry
      const oldestKey = this.deadLetterQueue.keys().next().value;
      if (oldestKey) {
        this.deadLetterQueue.delete(oldestKey);
      }
    }

    const taskInfo = this.taskRegistry.get(taskId);
    const dlqEntry: DLQEntry = {
      task: taskInfo?.task || ({} as ExecutableTask),
      failures: execution.error ? [execution.error] : [],
      enqueuedAt: new Date(),
      lastAttemptAt: new Date(),
      attempts: execution.attempts,
    };

    this.deadLetterQueue.set(taskId, dlqEntry);
    this.emit('task:dlq', { taskId, entry: dlqEntry });
  }

  public cancelTask(taskId: string): boolean {
    // Remove from queue if still pending
    const removed = this.taskQueue.remove(taskId);

    if (removed) {
      this.taskRegistry.delete(taskId);
      this.emit('task:cancelled', { taskId, wasQueued: true });
      return true;
    }

    // Check if executing
    const execution = this.executingTasks.get(taskId);
    if (execution) {
      execution.status = TaskExecutionStatus.CANCELLED;
      this.executingTasks.delete(taskId);
      this.taskRegistry.delete(taskId);
      this.emit('task:cancelled', { taskId, wasQueued: false });
      return true;
    }

    return false;
  }

  public rescheduleTask(
    taskId: string,
    newPriority?: TaskPriority,
    delay?: number
  ): boolean {
    const removed = this.taskQueue.remove(taskId);

    if (!removed) {
      return false;
    }

    if (delay && delay > 0) {
      const timer = setTimeout(() => {
        this.taskQueue.enqueue({
          ...removed,
          priority: newPriority ?? removed.priority,
          enqueuedAt: new Date(),
        });
        this.emit('task:enqueued', { taskId, priority: newPriority ?? removed.priority });
      }, delay);
      // Allow Node.js to exit even if timer is active
      if (timer.unref) {
        timer.unref();
      }
    } else {
      this.taskQueue.enqueue({
        ...removed,
        priority: newPriority ?? removed.priority,
        enqueuedAt: new Date(),
      });
    }

    this.emit('task:rescheduled', { taskId, newPriority, delay });
    return true;
  }

  public getQueueStats(): QueueStats {
    const queueAges = this.taskQueue.getQueueAges();
    const stats = this.taskQueue.getStats();
    const now = Date.now();

    const oldestAge = Math.max(...Object.values(queueAges));
    const totalWaitTime = this.taskQueue
      .getAllTasks()
      .reduce((sum, task) => sum + (now - task.enqueuedAt.getTime()), 0);

    // Convert string keys to TaskPriority numeric values
    const priorityDistribution: Record<TaskPriority, number> = {
      [TaskPriority.BACKGROUND]: 0,
      [TaskPriority.LOW]: 0,
      [TaskPriority.MEDIUM]: 0,
      [TaskPriority.HIGH]: 0,
      [TaskPriority.CRITICAL]: 0
    };
    Object.values(TaskPriority).forEach(value => {
      if (typeof value === 'number') {
        const priority = value as TaskPriority;
        const key = TaskPriority[priority] as keyof typeof stats.byPriority;
        priorityDistribution[priority] = stats.byPriority[key] || 0;
      }
    });

    return {
      length: stats.total,
      oldestTaskAge: oldestAge,
      averageWaitTime: stats.total > 0 ? totalWaitTime / stats.total : 0,
      throughput: this.calculateThroughput(),
      priorityDistribution,
    };
  }

  private calculateThroughput(): number {
    // Would need to track completed tasks over time
    return 0; // Placeholder
  }

  private startMetricsCollection(interval: number): void {
    this.metricsTimer = setInterval(() => {
      const stats = this.getQueueStats();
      this.metrics$.next(stats);
      this.emit('metrics', stats);
    }, interval);
    // Allow Node.js to exit even if timer is active
    if (this.metricsTimer.unref) {
      this.metricsTimer.unref();
    }
  }

  public getMetrics(): Observable<QueueStats | null> {
    return this.metrics$.asObservable();
  }

  public getExecutingTasks(): Map<string, TaskExecution> {
    return new Map(this.executingTasks);
  }

  public getDeadLetterQueue(): Map<string, DLQEntry> {
    return this.deadLetterQueue;
  }

  public retryDLQTask(taskId: string): boolean {
    const entry = this.deadLetterQueue.get(taskId);
    if (!entry) {
      return false;
    }

    this.deadLetterQueue.delete(taskId);

    // Reschedule with lower priority
    this.scheduleTask(entry.task, TaskPriority.LOW);

    this.emit('dlq:retry', { taskId });
    return true;
  }

  public clearDeadLetterQueue(): void {
    const size = this.deadLetterQueue.size;
    this.deadLetterQueue.clear();
    this.emit('dlq:cleared', { count: size });
  }

  public getTaskStatus(taskId: string): TaskExecutionStatus | null {
    const execution = this.executingTasks.get(taskId);
    if (execution) {
      return execution.status;
    }

    const queued = this.taskQueue.find(t => t.id === taskId);
    if (queued) {
      return TaskExecutionStatus.QUEUED;
    }

    const dlq = this.deadLetterQueue.get(taskId);
    if (dlq) {
      return TaskExecutionStatus.FAILED;
    }

    return null;
  }

  public async preemptTask(
    highPriorityTask: ExecutableTask,
    priority: TaskPriority = TaskPriority.CRITICAL
  ): Promise<string> {
    if (!this.config.enablePreemption) {
      throw new Error('Task preemption is not enabled');
    }

    // Find lowest priority executing task
    let lowestPriorityTask: TaskExecution | undefined;
    let lowestPriority = priority;

    for (const [taskId, execution] of this.executingTasks) {
      // Would need to track priority of executing tasks
      // This is a simplified implementation
      if (execution.status === TaskExecutionStatus.RUNNING) {
        lowestPriorityTask = execution;
        break;
      }
    }

    if (lowestPriorityTask) {
      // Pause the low priority task
      lowestPriorityTask.status = TaskExecutionStatus.PENDING;

      // Schedule high priority task
      const taskId = this.scheduleTask(highPriorityTask, priority);

      // Trigger immediate execution
      this.scheduleNextBatch();

      this.emit('task:preempted', {
        preemptedTaskId: lowestPriorityTask.taskId,
        newTaskId: taskId,
      });

      return taskId;
    }

    // No task to preempt, just schedule normally
    return this.scheduleTask(highPriorityTask, priority);
  }
}
