import { EventEmitter } from 'events';
import { Observable, Subject, BehaviorSubject, interval, timer } from 'rxjs';
import { takeUntil, filter, tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import {
  Checkpoint,
  CheckpointType,
  CheckpointState,
  CheckpointMetadata,
  RetentionPolicy,
  ExecutionContext,
  TaskExecution,
  WorkflowContext,
  TaskId,
} from './types';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface CheckpointManagerOptions {
  enableAutoCheckpointing?: boolean;
  checkpointInterval?: number;
  maxCheckpoints?: number;
  enableCompression?: boolean;
  enableEncryption?: boolean;
  encryptionKey?: string;
  storageType?: 'memory' | 'file' | 'database';
  storagePath?: string;
  retentionPolicy?: RetentionPolicy;
}

export interface CheckpointStorage {
  save(checkpoint: Checkpoint): Promise<void>;
  load(checkpointId: string): Promise<Checkpoint | null>;
  list(executionId?: string): Promise<Checkpoint[]>;
  delete(checkpointId: string): Promise<boolean>;
  cleanup(retentionPolicy: RetentionPolicy): Promise<number>;
}

export class MemoryCheckpointStorage implements CheckpointStorage {
  private checkpoints: Map<string, Checkpoint> = new Map();

  async save(checkpoint: Checkpoint): Promise<void> {
    this.checkpoints.set(checkpoint.id, checkpoint);
  }

  async load(checkpointId: string): Promise<Checkpoint | null> {
    return this.checkpoints.get(checkpointId) || null;
  }

  async list(executionId?: string): Promise<Checkpoint[]> {
    const checkpoints = Array.from(this.checkpoints.values());
    return executionId
      ? checkpoints.filter(cp => cp.executionId === executionId)
      : checkpoints;
  }

  async delete(checkpointId: string): Promise<boolean> {
    return this.checkpoints.delete(checkpointId);
  }

  async cleanup(retentionPolicy: RetentionPolicy): Promise<number> {
    let deleted = 0;
    const now = Date.now();
    const checkpoints = Array.from(this.checkpoints.values());

    for (const checkpoint of checkpoints) {
      let shouldDelete = false;

      // Check max age
      if (retentionPolicy.maxAge) {
        const age = now - checkpoint.createdAt.getTime();
        if (age > retentionPolicy.maxAge) {
          shouldDelete = true;
        }
      }

      // Check if it's a milestone and should be kept
      if (checkpoint.metadata?.isRecoveryPoint && retentionPolicy.keepMilestones) {
        shouldDelete = false;
      }

      if (shouldDelete) {
        this.checkpoints.delete(checkpoint.id);
        deleted++;
      }
    }

    // Check max count
    if (retentionPolicy.maxCount) {
      const remaining = Array.from(this.checkpoints.values())
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      if (remaining.length > retentionPolicy.maxCount) {
        const toDelete = remaining.slice(retentionPolicy.maxCount);
        for (const checkpoint of toDelete) {
          if (!checkpoint.metadata?.isRecoveryPoint || !retentionPolicy.keepMilestones) {
            this.checkpoints.delete(checkpoint.id);
            deleted++;
          }
        }
      }
    }

    return deleted;
  }
}

export class CheckpointManager extends EventEmitter {
  private storage: CheckpointStorage;
  private options: Required<CheckpointManagerOptions>;
  private checkpointTimer?: NodeJS.Timeout;
  private activeExecutions: Map<string, ExecutionContext> = new Map();
  private lastCheckpoints: Map<string, string> = new Map(); // executionId -> checkpointId
  private shutdown$ = new Subject<void>();
  private metrics$ = new BehaviorSubject<CheckpointMetrics | null>(null);

  constructor(
    storage?: CheckpointStorage,
    options: CheckpointManagerOptions = {}
  ) {
    super();

    this.storage = storage || new MemoryCheckpointStorage();
    this.options = {
      enableAutoCheckpointing: options.enableAutoCheckpointing ?? true,
      checkpointInterval: options.checkpointInterval ?? 30000, // 30 seconds
      maxCheckpoints: options.maxCheckpoints ?? 50,
      enableCompression: options.enableCompression ?? true,
      enableEncryption: options.enableEncryption ?? false,
      encryptionKey: options.encryptionKey || '',
      storageType: options.storageType ?? 'memory',
      storagePath: options.storagePath || './checkpoints',
      retentionPolicy: options.retentionPolicy || {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        maxCount: 20,
        keepMilestones: true,
        keepFailures: true,
      },
    };

    this.startAutoCheckpointing();
    this.startCleanupTask();
  }

  public async initialize(): Promise<void> {
    // CheckpointManager is initialized in constructor
    // This method is provided for interface compatibility
  }

  private startAutoCheckpointing(): void {
    if (!this.options.enableAutoCheckpointing) return;

    this.checkpointTimer = setInterval(() => {
      this.checkpointAllExecutions('scheduled');
    }, this.options.checkpointInterval);
  }

  private startCleanupTask(): void {
    // Clean up old checkpoints every hour
    interval(60 * 60 * 1000)
      .pipe(takeUntil(this.shutdown$))
      .subscribe(() => {
        this.cleanup();
      });
  }

  public async createCheckpoint(
    executionContext: ExecutionContext,
    taskStates: Map<TaskId, TaskExecution>,
    customState?: any,
    type: CheckpointType = CheckpointType.FULL,
    reason: 'scheduled' | 'manual' | 'pre_failure' | 'milestone' = 'manual'
  ): Promise<Checkpoint> {
    const checkpointId = uuidv4();
    const previousCheckpointId = this.lastCheckpoints.get(executionContext.executionId);

    // Create checkpoint state
    const state: CheckpointState = {
      executionContext,
      completedTasks: new Set(
        Array.from(taskStates.entries())
          .filter(([_, execution]) => execution.status === 'completed')
          .map(([taskId]) => taskId)
      ),
      taskStates,
      workflowContext: executionContext.context,
      variables: { ...executionContext.context },
      customState,
    };

    // Serialize state
    const serializedState = await this.serializeState(state);

    // Create metadata
    const metadata: CheckpointMetadata = {
      triggerReason: reason,
      previousCheckpointId,
      isRecoveryPoint: reason === 'milestone' || reason === 'pre_failure',
      retentionPolicy: this.options.retentionPolicy,
    };

    // Create checkpoint
    const checkpoint: Checkpoint = {
      id: checkpointId,
      executionId: executionContext.executionId,
      workflowId: executionContext.workflowId,
      createdAt: new Date(),
      type,
      state: state,
      metadata,
      size: serializedState.length,
      compressed: this.options.enableCompression,
      encrypted: this.options.enableEncryption,
    };

    // Save checkpoint
    await this.storage.save(checkpoint);

    // Update tracking
    this.lastCheckpoints.set(executionContext.executionId, checkpointId);

    // Emit events
    this.emit('checkpoint:created', checkpoint);

    return checkpoint;
  }

  public async restoreCheckpoint(checkpointId: string): Promise<{
    executionContext: ExecutionContext;
    taskStates: Map<TaskId, TaskExecution>;
    customState?: any;
  }> {
    // Load checkpoint
    const checkpoint = await this.storage.load(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    // Deserialize state
    const state = await this.deserializeState(checkpoint.state);

    this.emit('checkpoint:restored', { checkpoint, state });

    return {
      executionContext: state.executionContext,
      taskStates: state.taskStates,
      customState: state.customState,
    };
  }

  public async createMilestoneCheckpoint(
    executionContext: ExecutionContext,
    taskStates: Map<TaskId, TaskExecution>,
    milestoneName: string
  ): Promise<Checkpoint> {
    const checkpoint = await this.createCheckpoint(
      executionContext,
      taskStates,
      { milestoneName },
      CheckpointType.SNAPSHOT,
      'milestone'
    );

    if (checkpoint.metadata) {
      checkpoint.metadata.tags = [milestoneName, 'milestone'];
    }

    await this.storage.save(checkpoint);
    return checkpoint;
  }

  public async createIncrementalCheckpoint(
    executionContext: ExecutionContext,
    taskStates: Map<TaskId, TaskExecution>,
    changedTasks: Set<TaskId>
  ): Promise<Checkpoint> {
    const previousCheckpointId = this.lastCheckpoints.get(executionContext.executionId);

    if (!previousCheckpointId) {
      // No previous checkpoint, create full checkpoint
      return this.createCheckpoint(executionContext, taskStates);
    }

    // Create incremental state with only changed tasks
    const incrementalTaskStates = new Map<TaskId, TaskExecution>();
    for (const taskId of changedTasks) {
      const taskState = taskStates.get(taskId);
      if (taskState) {
        incrementalTaskStates.set(taskId, taskState);
      }
    }

    const checkpoint = await this.createCheckpoint(
      executionContext,
      incrementalTaskStates,
      { changedTasks: Array.from(changedTasks) },
      CheckpointType.INCREMENTAL
    );

    return checkpoint;
  }

  public async restoreFromLatest(executionId: string): Promise<{
    executionContext: ExecutionContext;
    taskStates: Map<TaskId, TaskExecution>;
    customState?: any;
  } | null> {
    const checkpoints = await this.storage.list(executionId);

    if (checkpoints.length === 0) {
      return null;
    }

    // Sort by creation date, newest first
    checkpoints.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Find the latest full or snapshot checkpoint
    let baseCheckpoint = checkpoints.find(
      cp => cp.type === CheckpointType.FULL || cp.type === CheckpointType.SNAPSHOT
    );

    if (!baseCheckpoint) {
      baseCheckpoint = checkpoints[0];
    }

    let restoredState = await this.restoreCheckpoint(baseCheckpoint.id);

    // Apply incremental checkpoints if any
    const incrementalCheckpoints = checkpoints
      .filter(cp =>
        cp.type === CheckpointType.INCREMENTAL &&
        cp.createdAt > baseCheckpoint!.createdAt
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    for (const incrementalCheckpoint of incrementalCheckpoints) {
      const incrementalState = await this.restoreCheckpoint(incrementalCheckpoint.id);

      // Merge incremental state
      for (const [taskId, taskState] of incrementalState.taskStates) {
        restoredState.taskStates.set(taskId, taskState);
      }
    }

    return restoredState;
  }

  private async serializeState(state: CheckpointState): Promise<Buffer> {
    // Convert Map to plain object for serialization
    const serializable = {
      ...state,
      completedTasks: Array.from(state.completedTasks),
      taskStates: Array.from(state.taskStates.entries()),
    };

    let data = Buffer.from(JSON.stringify(serializable), 'utf8');

    // Compress if enabled
    if (this.options.enableCompression) {
      data = Buffer.from(await gzipAsync(data));
    }

    // Encrypt if enabled
    if (this.options.enableEncryption && this.options.encryptionKey) {
      data = Buffer.from(this.encrypt(data));
    }

    return data;
  }

  private async deserializeState(serializedState: any): Promise<CheckpointState> {
    let data = serializedState;

    // Handle buffer or string data
    if (typeof data === 'string') {
      data = Buffer.from(data, 'base64');
    }

    // Decrypt if needed
    if (this.options.enableEncryption && this.options.encryptionKey) {
      data = this.decrypt(data);
    }

    // Decompress if needed
    if (this.options.enableCompression) {
      data = await gunzipAsync(data);
    }

    const parsed = JSON.parse(data.toString('utf8'));

    // Restore Map objects
    return {
      ...parsed,
      completedTasks: new Set(parsed.completedTasks),
      taskStates: new Map(parsed.taskStates),
    };
  }

  private encrypt(data: Buffer): Buffer {
    // Simple encryption - in production, use proper encryption
    const key = createHash('sha256').update(this.options.encryptionKey).digest();
    // This is a placeholder - implement proper encryption
    return data;
  }

  private decrypt(data: Buffer): Buffer {
    // Simple decryption - in production, use proper decryption
    // This is a placeholder - implement proper decryption
    return data;
  }

  public registerExecution(executionContext: ExecutionContext): void {
    this.activeExecutions.set(executionContext.executionId, executionContext);
  }

  public unregisterExecution(executionId: string): void {
    this.activeExecutions.delete(executionId);
    this.lastCheckpoints.delete(executionId);
  }

  private async checkpointAllExecutions(reason: 'scheduled' | 'manual' = 'scheduled'): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [executionId, context] of this.activeExecutions) {
      promises.push(
        this.createCheckpoint(context, new Map(), undefined, CheckpointType.FULL, reason)
          .then(() => {})
          .catch(error => {
            console.error(`Failed to checkpoint execution ${executionId}:`, error);
            this.emit('checkpoint:error', { executionId, error });
          })
      );
    }

    await Promise.allSettled(promises);
  }

  public async listCheckpoints(executionId?: string): Promise<Checkpoint[]> {
    return this.storage.list(executionId);
  }

  public async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    const success = await this.storage.delete(checkpointId);
    if (success) {
      this.emit('checkpoint:deleted', checkpointId);
    }
    return success;
  }

  public async cleanup(): Promise<number> {
    const deleted = await this.storage.cleanup(this.options.retentionPolicy);
    this.emit('checkpoint:cleanup', { deleted });
    return deleted;
  }

  public async getCheckpointInfo(checkpointId: string): Promise<{
    checkpoint: Checkpoint;
    stats: {
      taskCount: number;
      completedTasks: number;
      failedTasks: number;
      size: number;
    };
  } | null> {
    const checkpoint = await this.storage.load(checkpointId);
    if (!checkpoint) {
      return null;
    }

    const state = checkpoint.state;
    const taskStates = Array.from(state.taskStates.values());

    return {
      checkpoint,
      stats: {
        taskCount: taskStates.length,
        completedTasks: taskStates.filter(t => t.status === 'completed').length,
        failedTasks: taskStates.filter(t => t.status === 'failed').length,
        size: checkpoint.size,
      },
    };
  }

  public getMetrics(): Observable<CheckpointMetrics | null> {
    return this.metrics$.asObservable();
  }

  public async shutdown(): Promise<void> {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
    }

    // Create final checkpoints for active executions
    await this.checkpointAllExecutions('manual');

    this.shutdown$.next();
    this.shutdown$.complete();

    this.emit('checkpoint-manager:shutdown');
  }
}

interface CheckpointMetrics {
  totalCheckpoints: number;
  checkpointsByType: Record<CheckpointType, number>;
  averageSize: number;
  oldestCheckpoint: Date | null;
  newestCheckpoint: Date | null;
  storageUsage: number;
}

export default CheckpointManager;