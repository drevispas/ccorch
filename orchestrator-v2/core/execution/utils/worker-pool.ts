import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  Worker,
  WorkerStatus,
  WorkerPool as WorkerPoolType,
  WorkerPoolMetrics,
  ResourceRequirements,
  ExecutableTask,
  TaskExecution,
  TaskExecutionStatus,
} from '../types';

export interface WorkerPoolOptions {
  minWorkers?: number;
  maxWorkers?: number;
  workerIdleTimeout?: number;
  autoScale?: boolean;
  scaleUpThreshold?: number;
  scaleDownThreshold?: number;
  maxTasksPerWorker?: number;
  resourceTracking?: boolean;
  heartbeatInterval?: number;
}

export interface TaskExecutor {
  (task: ExecutableTask): Promise<any>;
}

export class WorkerPoolManager extends EventEmitter {
  private workers: Map<string, Worker>;
  private availableWorkers: Set<string>;
  private taskQueue: Map<string, ExecutableTask>;
  private taskExecutor: TaskExecutor;
  private options: Required<WorkerPoolOptions>;
  private metrics: WorkerPoolMetrics;
  private heartbeatTimers: Map<string, NodeJS.Timeout>;
  private idleTimers: Map<string, NodeJS.Timeout>;
  private autoScalingTimer?: NodeJS.Timeout;
  private isShuttingDown: boolean = false;

  constructor(taskExecutor: TaskExecutor, options: WorkerPoolOptions = {}) {
    super();

    this.taskExecutor = taskExecutor;
    this.workers = new Map();
    this.availableWorkers = new Set();
    this.taskQueue = new Map();
    this.heartbeatTimers = new Map();
    this.idleTimers = new Map();

    this.options = {
      minWorkers: options.minWorkers || 2,
      maxWorkers: options.maxWorkers || 10,
      workerIdleTimeout: options.workerIdleTimeout || 60000, // 1 minute
      autoScale: options.autoScale ?? true,
      scaleUpThreshold: options.scaleUpThreshold || 0.8,
      scaleDownThreshold: options.scaleDownThreshold || 0.2,
      maxTasksPerWorker: options.maxTasksPerWorker || 1,
      resourceTracking: options.resourceTracking ?? false,
      heartbeatInterval: options.heartbeatInterval || 5000, // 5 seconds
    };

    this.metrics = {
      tasksProcessed: 0,
      averageQueueTime: 0,
      averageProcessingTime: 0,
      workerUtilization: 0,
      throughput: 0,
    };

    this.initialize();
  }

  private async initialize(): Promise<void> {
    // Create initial workers
    for (let i = 0; i < this.options.minWorkers; i++) {
      await this.createWorker();
    }

    // Start auto-scaling monitor if enabled (skip in test environment)
    if (this.options.autoScale && process.env.NODE_ENV !== 'test') {
      this.startAutoScaling();
    }
  }

  private async createWorker(): Promise<Worker> {
    const workerId = uuidv4();
    const worker: Worker = {
      id: workerId,
      status: WorkerStatus.IDLE,
      capacity: {
        cpu: 1,
        memory: 1024, // MB
        io: 100,
        network: 100,
      },
      utilization: {
        cpu: 0,
        memory: 0,
        io: 0,
        network: 0,
      },
      startedAt: new Date(),
      lastHeartbeat: new Date(),
      tasksCompleted: 0,
      tasksFailed: 0,
      averageTaskDuration: 0,
    };

    this.workers.set(workerId, worker);
    this.availableWorkers.add(workerId);

    // Start heartbeat
    this.startHeartbeat(workerId);

    // Start idle timer
    this.resetIdleTimer(workerId);

    this.emit('worker:created', worker);
    return worker;
  }

  private async terminateWorker(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    // Don't terminate if worker is busy
    if (worker.status === WorkerStatus.BUSY) {
      worker.status = WorkerStatus.DRAINING;
      return;
    }

    // Clear timers
    const heartbeatTimer = this.heartbeatTimers.get(workerId);
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      this.heartbeatTimers.delete(workerId);
    }

    const idleTimer = this.idleTimers.get(workerId);
    if (idleTimer) {
      clearTimeout(idleTimer);
      this.idleTimers.delete(workerId);
    }

    // Remove worker
    this.workers.delete(workerId);
    this.availableWorkers.delete(workerId);

    worker.status = WorkerStatus.TERMINATED;
    this.emit('worker:terminated', worker);
  }

  private startHeartbeat(workerId: string): void {
    const timer = setInterval(() => {
      const worker = this.workers.get(workerId);
      if (!worker) {
        clearInterval(timer);
        return;
      }

      worker.lastHeartbeat = new Date();

      // Check if worker is healthy
      const timeSinceLastHeartbeat = Date.now() - worker.lastHeartbeat.getTime();
      if (timeSinceLastHeartbeat > this.options.heartbeatInterval * 3) {
        worker.status = WorkerStatus.FAILED;
        this.handleWorkerFailure(workerId);
      }
    }, this.options.heartbeatInterval);

    // Allow Node.js to exit even if timer is active
    if (timer.unref) {
      timer.unref();
    }

    this.heartbeatTimers.set(workerId, timer);
  }

  private resetIdleTimer(workerId: string): void {
    // Clear existing timer
    const existingTimer = this.idleTimers.get(workerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Don't set idle timer for minimum workers
    if (this.workers.size <= this.options.minWorkers) {
      return;
    }

    // Set new timer
    const timer = setTimeout(() => {
      const worker = this.workers.get(workerId);
      if (worker && worker.status === WorkerStatus.IDLE) {
        this.terminateWorker(workerId);
      }
    }, this.options.workerIdleTimeout);

    this.idleTimers.set(workerId, timer);
  }

  private handleWorkerFailure(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    // Requeue the task if worker was busy
    if (worker.currentTask) {
      this.taskQueue.set(worker.currentTask, {} as ExecutableTask); // Would need actual task
      this.emit('task:requeued', worker.currentTask);
    }

    // Remove failed worker
    this.terminateWorker(workerId);

    // Create replacement worker if below minimum
    if (this.workers.size < this.options.minWorkers) {
      this.createWorker();
    }

    this.emit('worker:failed', worker);
  }

  private startAutoScaling(): void {
    this.autoScalingTimer = setInterval(() => {
      if (this.isShuttingDown) return;

      const utilization = this.calculateUtilization();

      // Scale up if utilization is high
      if (utilization > this.options.scaleUpThreshold) {
        this.scaleUp();
      }
      // Scale down if utilization is low
      else if (utilization < this.options.scaleDownThreshold) {
        this.scaleDown();
      }
    }, 10000); // Check every 10 seconds

    // Allow Node.js to exit even if timer is active
    if (this.autoScalingTimer.unref) {
      this.autoScalingTimer.unref();
    }
  }

  private calculateUtilization(): number {
    if (this.workers.size === 0) return 0;

    const busyWorkers = Array.from(this.workers.values())
      .filter(w => w.status === WorkerStatus.BUSY).length;

    return busyWorkers / this.workers.size;
  }

  private async scaleUp(): Promise<void> {
    const currentSize = this.workers.size;
    if (currentSize >= this.options.maxWorkers) {
      return;
    }

    const newWorkerCount = Math.min(
      Math.ceil(currentSize * 1.5),
      this.options.maxWorkers
    ) - currentSize;

    for (let i = 0; i < newWorkerCount; i++) {
      await this.createWorker();
    }

    this.emit('pool:scaled-up', { from: currentSize, to: this.workers.size });
  }

  private async scaleDown(): Promise<void> {
    const currentSize = this.workers.size;
    if (currentSize <= this.options.minWorkers) {
      return;
    }

    const targetSize = Math.max(
      Math.floor(currentSize * 0.75),
      this.options.minWorkers
    );

    const workersToRemove = currentSize - targetSize;
    const idleWorkers = Array.from(this.workers.entries())
      .filter(([_, w]) => w.status === WorkerStatus.IDLE)
      .slice(0, workersToRemove);

    for (const [workerId] of idleWorkers) {
      await this.terminateWorker(workerId);
    }

    this.emit('pool:scaled-down', { from: currentSize, to: this.workers.size });
  }

  public async executeTask(task: ExecutableTask): Promise<TaskExecution> {
    const taskExecution: TaskExecution = {
      taskId: task.id,
      executionId: uuidv4(),
      status: TaskExecutionStatus.QUEUED,
      attempts: 0,
      metrics: {
        startTime: Date.now(),
        attempts: 0,
        retries: 0,
        queueTime: 0,
        executionTime: 0,
      },
    };

    // Find available worker
    const workerId = this.getAvailableWorker();

    if (!workerId) {
      // Queue the task if no workers available
      this.taskQueue.set(task.id, task);
      this.emit('task:queued', task);

      // Try to scale up if auto-scaling is enabled
      if (this.options.autoScale && this.workers.size < this.options.maxWorkers) {
        this.scaleUp();
      }

      return taskExecution;
    }

    // Execute task on worker
    return this.executeOnWorker(workerId, task, taskExecution);
  }

  private getAvailableWorker(): string | null {
    for (const workerId of this.availableWorkers) {
      const worker = this.workers.get(workerId);
      if (worker && worker.status === WorkerStatus.IDLE) {
        return workerId;
      }
    }
    return null;
  }

  private async executeOnWorker(
    workerId: string,
    task: ExecutableTask,
    execution: TaskExecution
  ): Promise<TaskExecution> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }

    // Mark worker as busy
    worker.status = WorkerStatus.BUSY;
    worker.currentTask = task.id;
    this.availableWorkers.delete(workerId);

    // Update execution status
    execution.status = TaskExecutionStatus.RUNNING;
    execution.attempts++;

    const startTime = Date.now();

    try {
      // Execute the task
      this.emit('task:started', { task, worker });
      const result = await this.taskExecutor(task);

      // Update metrics
      const endTime = Date.now();
      execution.status = TaskExecutionStatus.COMPLETED;
      execution.result = result;

      if (execution.metrics) {
        execution.metrics.executionTime = endTime - startTime;
        execution.metrics.endTime = endTime;
      }

      // Update worker metrics
      worker.tasksCompleted++;
      const totalDuration = worker.averageTaskDuration * (worker.tasksCompleted - 1);
      worker.averageTaskDuration = (totalDuration + (endTime - startTime)) / worker.tasksCompleted;

      this.metrics.tasksProcessed++;
      this.emit('task:completed', { task, worker, result });

      return execution;
    } catch (error) {
      // Handle task failure
      execution.status = TaskExecutionStatus.FAILED;
      execution.error = {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
        details: error,
      };

      worker.tasksFailed++;
      this.emit('task:failed', { task, worker, error });

      throw error;
    } finally {
      // Mark worker as available
      worker.status = WorkerStatus.IDLE;
      worker.currentTask = undefined;
      this.availableWorkers.add(workerId);

      // Reset idle timer
      this.resetIdleTimer(workerId);

      // Process queued tasks
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.taskQueue.size === 0) return;

    const workerId = this.getAvailableWorker();
    if (!workerId) return;

    const nextEntry = this.taskQueue.entries().next();
    if (!nextEntry.value) return;

    const [taskId, task] = nextEntry.value;
    if (!task) return;

    this.taskQueue.delete(taskId);

    const execution: TaskExecution = {
      taskId: task.id,
      executionId: uuidv4(),
      status: TaskExecutionStatus.PENDING,
      attempts: 0,
      metrics: {
        startTime: Date.now(),
        attempts: 0,
        retries: 0,
        queueTime: Date.now() - Date.now(), // Would need actual queue time
        executionTime: 0,
      },
    };

    await this.executeOnWorker(workerId, task, execution);
  }

  public async shutdown(graceful: boolean = true): Promise<void> {
    this.isShuttingDown = true;

    // Clear auto-scaling timer
    if (this.autoScalingTimer) {
      clearInterval(this.autoScalingTimer);
      this.autoScalingTimer = undefined;
    }

    if (graceful) {
      // Mark all workers as draining
      for (const worker of this.workers.values()) {
        if (worker.status === WorkerStatus.IDLE) {
          await this.terminateWorker(worker.id);
        } else {
          worker.status = WorkerStatus.DRAINING;
        }
      }

      // Wait for all workers to finish
      await this.waitForWorkers();
    }

    // Force terminate all workers
    for (const workerId of this.workers.keys()) {
      await this.terminateWorker(workerId);
    }

    this.emit('pool:shutdown');
  }

  private async waitForWorkers(timeout: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (this.workers.size > 0) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Worker shutdown timeout');
      }

      const busyWorkers = Array.from(this.workers.values())
        .filter(w => w.status === WorkerStatus.BUSY);

      if (busyWorkers.length === 0) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  public getPool(): WorkerPoolType {
    const totalCapacity: ResourceRequirements = {
      cpu: 0,
      memory: 0,
      io: 0,
      network: 0,
    };

    const currentUtilization: ResourceRequirements = {
      cpu: 0,
      memory: 0,
      io: 0,
      network: 0,
    };

    for (const worker of this.workers.values()) {
      totalCapacity.cpu! += worker.capacity.cpu || 0;
      totalCapacity.memory! += worker.capacity.memory || 0;
      totalCapacity.io! += worker.capacity.io || 0;
      totalCapacity.network! += worker.capacity.network || 0;

      currentUtilization.cpu! += worker.utilization.cpu || 0;
      currentUtilization.memory! += worker.utilization.memory || 0;
      currentUtilization.io! += worker.utilization.io || 0;
      currentUtilization.network! += worker.utilization.network || 0;
    }

    return {
      workers: this.workers,
      activeWorkers: Array.from(this.workers.values())
        .filter(w => w.status === WorkerStatus.BUSY).length,
      totalCapacity,
      currentUtilization,
      queueLength: this.taskQueue.size,
      metrics: this.metrics,
    };
  }

  public getMetrics(): WorkerPoolMetrics {
    return { ...this.metrics };
  }

  public getWorkerCount(): { total: number; busy: number; idle: number; draining: number } {
    const workers = Array.from(this.workers.values());
    return {
      total: workers.length,
      busy: workers.filter(w => w.status === WorkerStatus.BUSY).length,
      idle: workers.filter(w => w.status === WorkerStatus.IDLE).length,
      draining: workers.filter(w => w.status === WorkerStatus.DRAINING).length,
    };
  }
}