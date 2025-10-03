import { createClient, RedisClientType } from 'redis';
import winston from 'winston';
import {
  BasePersistenceAdapter,
  WorkflowFilter,
  TaskFilter,
  AgentFilter,
  EventFilter
} from './persistence-adapter';
import {
  StateSnapshot,
  WorkflowState,
  TaskState,
  AgentState,
  StateEvent
} from '../types';

export interface RedisAdapterConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  ttl?: number;
  enableLogging?: boolean;
}

export class RedisAdapter extends BasePersistenceAdapter {
  private client: RedisClientType;
  private config: RedisAdapterConfig;
  private logger: winston.Logger;

  constructor(config: RedisAdapterConfig = {}) {
    super();
    this.config = {
      host: 'localhost',
      port: 6379,
      db: 0,
      keyPrefix: 'orchestrator:',
      ttl: 86400,
      enableLogging: true,
      ...config
    };

    this.client = createClient({
      socket: {
        host: this.config.host,
        port: this.config.port
      },
      password: this.config.password,
      database: this.config.db
    });

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      defaultMeta: { service: 'RedisAdapter' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('error', (err) => {
      this.logger.error('Redis client error:', err);
    });

    this.client.on('connect', () => {
      this.logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      this.logger.info('Redis client ready');
    });

    this.client.on('end', () => {
      this.logger.info('Redis client connection closed');
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.connected = true;
      this.logger.info('Connected to Redis');
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      // Check if client is still open before attempting to disconnect
      if (this.client.isOpen) {
        await this.client.quit();
      }
      this.connected = false;
      this.logger.info('Disconnected from Redis');
    } catch (error) {
      this.logger.error('Failed to disconnect from Redis:', error);
      // Don't throw the error - just log it and mark as disconnected
      this.connected = false;
    }
  }

  private getKey(type: string, id: string): string {
    return `${this.config.keyPrefix}${type}:${id}`;
  }

  private getIndexKey(type: string, index: string): string {
    return `${this.config.keyPrefix}index:${type}:${index}`;
  }

  async saveWorkflow(workflow: WorkflowState): Promise<void> {
    this.ensureConnected();
    const key = this.getKey('workflow', workflow.id);
    const value = this.serialize(workflow);

    await this.client.set(key, value, {
      EX: this.config.ttl
    });

    await this.client.sAdd(this.getIndexKey('workflow', 'all'), workflow.id);
    await this.client.sAdd(this.getIndexKey('workflow', `status:${workflow.status}`), workflow.id);

    for (const tag of workflow.tags) {
      await this.client.sAdd(this.getIndexKey('workflow', `tag:${tag}`), workflow.id);
    }

    if (this.config.enableLogging) {
      this.logger.debug(`Saved workflow: ${workflow.id}`);
    }
  }

  async getWorkflow(workflowId: string): Promise<WorkflowState | null> {
    this.ensureConnected();
    const key = this.getKey('workflow', workflowId);
    const value = await this.client.get(key);

    if (!value) {
      return null;
    }

    return this.deserialize<WorkflowState>(value);
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    this.ensureConnected();
    const workflow = await this.getWorkflow(workflowId);

    if (!workflow) {
      return;
    }

    const key = this.getKey('workflow', workflowId);
    await this.client.del(key);

    await this.client.sRem(this.getIndexKey('workflow', 'all'), workflowId);
    await this.client.sRem(this.getIndexKey('workflow', `status:${workflow.status}`), workflowId);

    for (const tag of workflow.tags) {
      await this.client.sRem(this.getIndexKey('workflow', `tag:${tag}`), workflowId);
    }

    if (this.config.enableLogging) {
      this.logger.debug(`Deleted workflow: ${workflowId}`);
    }
  }

  async listWorkflows(filter?: WorkflowFilter): Promise<WorkflowState[]> {
    this.ensureConnected();
    let workflowIds: string[] = [];

    if (filter?.status) {
      const ids = await this.client.sMembers(this.getIndexKey('workflow', `status:${filter.status}`));
      workflowIds = ids;
    } else if (filter?.tags && filter.tags.length > 0) {
      const tagSets = await Promise.all(
        filter.tags.map(tag => this.client.sMembers(this.getIndexKey('workflow', `tag:${tag}`)))
      );
      workflowIds = tagSets[0].filter(id =>
        tagSets.every(set => set.includes(id))
      );
    } else {
      workflowIds = await this.client.sMembers(this.getIndexKey('workflow', 'all'));
    }

    const workflows = await Promise.all(
      workflowIds.map(id => this.getWorkflow(id))
    );

    let result = workflows.filter(w => w !== null) as WorkflowState[];

    if (filter?.createdAfter) {
      result = result.filter(w => w.createdAt >= filter.createdAfter!);
    }
    if (filter?.createdBefore) {
      result = result.filter(w => w.createdAt <= filter.createdBefore!);
    }

    result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (filter?.offset) {
      result = result.slice(filter.offset);
    }
    if (filter?.limit) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  async saveTask(task: TaskState): Promise<void> {
    this.ensureConnected();
    const key = this.getKey('task', task.id);
    const value = this.serialize(task);

    await this.client.set(key, value, {
      EX: this.config.ttl
    });

    await this.client.sAdd(this.getIndexKey('task', 'all'), task.id);
    await this.client.sAdd(this.getIndexKey('task', `workflow:${task.workflowId}`), task.id);
    await this.client.sAdd(this.getIndexKey('task', `status:${task.status}`), task.id);
    await this.client.sAdd(this.getIndexKey('task', `agent:${task.agentName}`), task.id);

    if (this.config.enableLogging) {
      this.logger.debug(`Saved task: ${task.id}`);
    }
  }

  async getTask(taskId: string): Promise<TaskState | null> {
    this.ensureConnected();
    const key = this.getKey('task', taskId);
    const value = await this.client.get(key);

    if (!value) {
      return null;
    }

    return this.deserialize<TaskState>(value);
  }

  async deleteTask(taskId: string): Promise<void> {
    this.ensureConnected();
    const task = await this.getTask(taskId);

    if (!task) {
      return;
    }

    const key = this.getKey('task', taskId);
    await this.client.del(key);

    await this.client.sRem(this.getIndexKey('task', 'all'), taskId);
    await this.client.sRem(this.getIndexKey('task', `workflow:${task.workflowId}`), taskId);
    await this.client.sRem(this.getIndexKey('task', `status:${task.status}`), taskId);
    await this.client.sRem(this.getIndexKey('task', `agent:${task.agentName}`), taskId);

    if (this.config.enableLogging) {
      this.logger.debug(`Deleted task: ${taskId}`);
    }
  }

  async listTasks(filter?: TaskFilter): Promise<TaskState[]> {
    this.ensureConnected();
    let taskIds: string[] = [];

    if (filter?.workflowId) {
      taskIds = await this.client.sMembers(this.getIndexKey('task', `workflow:${filter.workflowId}`));
    } else if (filter?.status) {
      taskIds = await this.client.sMembers(this.getIndexKey('task', `status:${filter.status}`));
    } else if (filter?.agentName) {
      taskIds = await this.client.sMembers(this.getIndexKey('task', `agent:${filter.agentName}`));
    } else {
      taskIds = await this.client.sMembers(this.getIndexKey('task', 'all'));
    }

    const tasks = await Promise.all(
      taskIds.map(id => this.getTask(id))
    );

    let result = tasks.filter(t => t !== null) as TaskState[];

    if (filter?.priority !== undefined) {
      result = result.filter(t => t.priority >= filter.priority!);
    }

    result.sort((a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime());

    if (filter?.offset) {
      result = result.slice(filter.offset);
    }
    if (filter?.limit) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  async saveAgent(agent: AgentState): Promise<void> {
    this.ensureConnected();
    const key = this.getKey('agent', agent.name);
    const value = this.serialize(agent);

    await this.client.set(key, value, {
      EX: this.config.ttl
    });

    await this.client.sAdd(this.getIndexKey('agent', 'all'), agent.name);
    await this.client.sAdd(this.getIndexKey('agent', `status:${agent.status}`), agent.name);
    await this.client.sAdd(this.getIndexKey('agent', `complexity:${agent.complexity}`), agent.name);

    for (const capability of agent.capabilities) {
      await this.client.sAdd(this.getIndexKey('agent', `capability:${capability}`), agent.name);
    }

    if (this.config.enableLogging) {
      this.logger.debug(`Saved agent: ${agent.name}`);
    }
  }

  async getAgent(agentName: string): Promise<AgentState | null> {
    this.ensureConnected();
    const key = this.getKey('agent', agentName);
    const value = await this.client.get(key);

    if (!value) {
      return null;
    }

    return this.deserialize<AgentState>(value);
  }

  async deleteAgent(agentName: string): Promise<void> {
    this.ensureConnected();
    const agent = await this.getAgent(agentName);

    if (!agent) {
      return;
    }

    const key = this.getKey('agent', agentName);
    await this.client.del(key);

    await this.client.sRem(this.getIndexKey('agent', 'all'), agentName);
    await this.client.sRem(this.getIndexKey('agent', `status:${agent.status}`), agentName);
    await this.client.sRem(this.getIndexKey('agent', `complexity:${agent.complexity}`), agentName);

    for (const capability of agent.capabilities) {
      await this.client.sRem(this.getIndexKey('agent', `capability:${capability}`), agentName);
    }

    if (this.config.enableLogging) {
      this.logger.debug(`Deleted agent: ${agentName}`);
    }
  }

  async listAgents(filter?: AgentFilter): Promise<AgentState[]> {
    this.ensureConnected();
    let agentNames: string[] = [];

    if (filter?.status) {
      agentNames = await this.client.sMembers(this.getIndexKey('agent', `status:${filter.status}`));
    } else if (filter?.complexity) {
      agentNames = await this.client.sMembers(this.getIndexKey('agent', `complexity:${filter.complexity}`));
    } else if (filter?.capabilities && filter.capabilities.length > 0) {
      const capSets = await Promise.all(
        filter.capabilities.map(cap => this.client.sMembers(this.getIndexKey('agent', `capability:${cap}`)))
      );
      agentNames = capSets[0].filter(name =>
        capSets.every(set => set.includes(name))
      );
    } else {
      agentNames = await this.client.sMembers(this.getIndexKey('agent', 'all'));
    }

    const agents = await Promise.all(
      agentNames.map(name => this.getAgent(name))
    );

    let result = agents.filter(a => a !== null) as AgentState[];

    if (filter?.offset) {
      result = result.slice(filter.offset);
    }
    if (filter?.limit) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  async saveEvent(event: StateEvent): Promise<void> {
    this.ensureConnected();
    const key = this.getKey('event', event.id);
    const value = this.serialize(event);

    await this.client.set(key, value, {
      EX: this.config.ttl
    });

    await this.client.zAdd(this.getIndexKey('event', 'timeline'), {
      score: event.timestamp.getTime(),
      value: event.id
    });

    await this.client.sAdd(this.getIndexKey('event', `type:${event.type}`), event.id);

    if (event.correlationId) {
      await this.client.sAdd(this.getIndexKey('event', `correlation:${event.correlationId}`), event.id);
    }

    if (this.config.enableLogging) {
      this.logger.debug(`Saved event: ${event.id} (${event.type})`);
    }
  }

  async getEvents(filter?: EventFilter): Promise<StateEvent[]> {
    this.ensureConnected();
    let eventIds: string[] = [];

    if (filter?.correlationId) {
      eventIds = await this.client.sMembers(this.getIndexKey('event', `correlation:${filter.correlationId}`));
    } else if (filter?.type) {
      eventIds = await this.client.sMembers(this.getIndexKey('event', `type:${filter.type}`));
    } else {
      const startScore = filter?.startTime ? filter.startTime.getTime() : '-inf';
      const endScore = filter?.endTime ? filter.endTime.getTime() : '+inf';

      eventIds = await this.client.zRangeByScore(
        this.getIndexKey('event', 'timeline'),
        startScore,
        endScore
      );
    }

    const events = await Promise.all(
      eventIds.map(async id => {
        const key = this.getKey('event', id);
        const value = await this.client.get(key);
        return value ? this.deserialize<StateEvent>(value) : null;
      })
    );

    let result = events.filter(e => e !== null) as StateEvent[];

    result.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filter?.offset) {
      result = result.slice(filter.offset);
    }
    if (filter?.limit) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  async getEventCount(filter?: EventFilter): Promise<number> {
    this.ensureConnected();

    if (filter?.type) {
      const members = await this.client.sMembers(this.getIndexKey('event', `type:${filter.type}`));
      return members.length;
    }

    if (filter?.correlationId) {
      const members = await this.client.sMembers(this.getIndexKey('event', `correlation:${filter.correlationId}`));
      return members.length;
    }

    const startScore = filter?.startTime ? filter.startTime.getTime() : '-inf';
    const endScore = filter?.endTime ? filter.endTime.getTime() : '+inf';

    const count = await this.client.zCount(
      this.getIndexKey('event', 'timeline'),
      startScore,
      endScore
    );

    return count;
  }

  async saveSnapshot(snapshot: StateSnapshot): Promise<void> {
    this.ensureConnected();
    const key = this.getKey('snapshot', snapshot.id);
    const value = this.serialize(snapshot);

    await this.client.set(key, value);

    await this.client.zAdd(this.getIndexKey('snapshot', 'timeline'), {
      score: snapshot.createdAt.getTime(),
      value: snapshot.id
    });

    await this.client.set(this.getKey('snapshot', 'latest'), snapshot.id);

    if (this.config.enableLogging) {
      this.logger.info(`Saved snapshot: ${snapshot.id} (version ${snapshot.version})`);
    }
  }

  async getSnapshot(snapshotId: string): Promise<StateSnapshot | null> {
    this.ensureConnected();
    const key = this.getKey('snapshot', snapshotId);
    const value = await this.client.get(key);

    if (!value) {
      return null;
    }

    return this.deserialize<StateSnapshot>(value);
  }

  async getLatestSnapshot(): Promise<StateSnapshot | null> {
    this.ensureConnected();
    const latestId = await this.client.get(this.getKey('snapshot', 'latest'));

    if (!latestId) {
      return null;
    }

    return this.getSnapshot(latestId);
  }

  async listSnapshots(limit: number = 10): Promise<StateSnapshot[]> {
    this.ensureConnected();
    const snapshotIds = await this.client.zRange(
      this.getIndexKey('snapshot', 'timeline'),
      '+inf',
      '-inf',
      {
        BY: 'SCORE',
        REV: true,
        LIMIT: {
          offset: 0,
          count: limit
        }
      }
    );

    const snapshots = await Promise.all(
      snapshotIds.map(id => this.getSnapshot(id))
    );

    return snapshots.filter(s => s !== null) as StateSnapshot[];
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    this.ensureConnected();
    const key = this.getKey('snapshot', snapshotId);
    await this.client.del(key);

    await this.client.zRem(this.getIndexKey('snapshot', 'timeline'), snapshotId);

    const latestId = await this.client.get(this.getKey('snapshot', 'latest'));
    if (latestId === snapshotId) {
      const snapshots = await this.listSnapshots(1);
      if (snapshots.length > 0) {
        await this.client.set(this.getKey('snapshot', 'latest'), snapshots[0].id);
      } else {
        await this.client.del(this.getKey('snapshot', 'latest'));
      }
    }

    if (this.config.enableLogging) {
      this.logger.info(`Deleted snapshot: ${snapshotId}`);
    }
  }

  async transaction<T>(operations: () => Promise<T>): Promise<T> {
    this.ensureConnected();

    const multi = this.client.multi();

    try {
      const result = await operations();
      await multi.exec();
      return result;
    } catch (error) {
      multi.discard();
      throw error;
    }
  }

  async clear(): Promise<void> {
    this.ensureConnected();

    const keys = await this.client.keys(`${this.config.keyPrefix}*`);

    if (keys.length > 0) {
      await this.client.del(keys);
    }

    if (this.config.enableLogging) {
      this.logger.warn(`Cleared all data (${keys.length} keys deleted)`);
    }
  }
}