import Database from 'better-sqlite3';
import winston from 'winston';
import path from 'path';
import fs from 'fs/promises';
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

export interface SqliteAdapterConfig {
  dbPath?: string;
  inMemory?: boolean;
  enableWAL?: boolean;
  enableLogging?: boolean;
  vacuumInterval?: number;
}

export class SqliteAdapter extends BasePersistenceAdapter {
  private db: Database.Database;
  private config: SqliteAdapterConfig;
  private logger: winston.Logger;
  private vacuumTimer?: NodeJS.Timeout;

  constructor(config: SqliteAdapterConfig = {}) {
    super();
    this.config = {
      dbPath: './data/orchestrator.db',
      inMemory: false,
      enableWAL: true,
      enableLogging: true,
      vacuumInterval: 3600000,
      ...config
    };

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      defaultMeta: { service: 'SqliteAdapter' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    this.db = this.initializeDatabase();
  }

  private initializeDatabase(): Database.Database {
    const dbPath = this.config.inMemory ? ':memory:' : this.config.dbPath!;

    if (!this.config.inMemory) {
      const dir = path.dirname(dbPath);
      fs.mkdir(dir, { recursive: true }).catch(() => {});
    }

    const db = new Database(dbPath);

    if (this.config.enableWAL && !this.config.inMemory) {
      db.pragma('journal_mode = WAL');
    }

    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    return db;
  }

  async connect(): Promise<void> {
    try {
      this.createTables();
      this.createIndexes();

      if (this.config.vacuumInterval) {
        this.scheduleVacuum();
      }

      this.connected = true;
      this.logger.info(`Connected to SQLite database: ${this.config.inMemory ? 'in-memory' : this.config.dbPath}`);
    } catch (error) {
      this.logger.error('Failed to connect to SQLite:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.vacuumTimer) {
        clearInterval(this.vacuumTimer);
      }

      this.db.close();
      this.connected = false;
      this.logger.info('Disconnected from SQLite database');
    } catch (error) {
      this.logger.error('Failed to disconnect from SQLite:', error);
      throw error;
    }
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        last_modified_at INTEGER NOT NULL,
        created_by TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workflow_tags (
        workflow_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (workflow_id, tag),
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        complexity TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS agents (
        name TEXT PRIMARY KEY,
        complexity TEXT NOT NULL,
        status TEXT NOT NULL,
        version TEXT NOT NULL,
        data TEXT NOT NULL,
        loaded_at INTEGER,
        last_active_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS agent_capabilities (
        agent_name TEXT NOT NULL,
        capability TEXT NOT NULL,
        PRIMARY KEY (agent_name, capability),
        FOREIGN KEY (agent_name) REFERENCES agents(name) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        correlation_id TEXT,
        workflow_id TEXT,
        task_id TEXT,
        agent_name TEXT,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        data TEXT NOT NULL,
        reason TEXT NOT NULL,
        automated INTEGER NOT NULL,
        compressed INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  private createIndexes(): void {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
      CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at);
      CREATE INDEX IF NOT EXISTS idx_workflow_tags_tag ON workflow_tags(tag);

      CREATE INDEX IF NOT EXISTS idx_tasks_workflow_id ON tasks(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_agent_name ON tasks(agent_name);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_agents_complexity ON agents(complexity);

      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

      CREATE INDEX IF NOT EXISTS idx_snapshots_version ON snapshots(version);
      CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON snapshots(created_at);
    `);
  }

  private scheduleVacuum(): void {
    this.vacuumTimer = setInterval(() => {
      try {
        this.db.exec('VACUUM');
        this.logger.info('Database vacuum completed');
      } catch (error) {
        this.logger.error('Database vacuum failed:', error);
      }
    }, this.config.vacuumInterval!);
  }

  async saveWorkflow(workflow: WorkflowState): Promise<void> {
    this.ensureConnected();

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO workflows (
        id, name, description, status, data,
        created_at, started_at, completed_at, last_modified_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const deleteTagsStmt = this.db.prepare('DELETE FROM workflow_tags WHERE workflow_id = ?');
    const insertTagStmt = this.db.prepare('INSERT INTO workflow_tags (workflow_id, tag) VALUES (?, ?)');

    this.db.transaction(() => {
      stmt.run(
        workflow.id,
        workflow.name,
        workflow.description,
        workflow.status,
        this.serialize(workflow),
        workflow.createdAt.getTime(),
        workflow.startedAt?.getTime() || null,
        workflow.completedAt?.getTime() || null,
        workflow.lastModifiedAt.getTime(),
        workflow.createdBy
      );

      deleteTagsStmt.run(workflow.id);

      for (const tag of workflow.tags) {
        insertTagStmt.run(workflow.id, tag);
      }
    })();

    if (this.config.enableLogging) {
      this.logger.debug(`Saved workflow: ${workflow.id}`);
    }
  }

  async getWorkflow(workflowId: string): Promise<WorkflowState | null> {
    this.ensureConnected();

    const stmt = this.db.prepare('SELECT data FROM workflows WHERE id = ?');
    const row = stmt.get(workflowId) as { data: string } | undefined;

    if (!row) {
      return null;
    }

    return this.deserialize<WorkflowState>(row.data);
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    this.ensureConnected();

    const stmt = this.db.prepare('DELETE FROM workflows WHERE id = ?');
    stmt.run(workflowId);

    if (this.config.enableLogging) {
      this.logger.debug(`Deleted workflow: ${workflowId}`);
    }
  }

  async listWorkflows(filter?: WorkflowFilter): Promise<WorkflowState[]> {
    this.ensureConnected();

    let query = 'SELECT DISTINCT w.data FROM workflows w';
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter?.tags && filter.tags.length > 0) {
      query += ' JOIN workflow_tags wt ON w.id = wt.workflow_id';
      conditions.push(`wt.tag IN (${filter.tags.map(() => '?').join(', ')})`);
      params.push(...filter.tags);
    }

    if (filter?.status) {
      conditions.push('w.status = ?');
      params.push(filter.status);
    }

    if (filter?.createdAfter) {
      conditions.push('w.created_at >= ?');
      params.push(filter.createdAfter.getTime());
    }

    if (filter?.createdBefore) {
      conditions.push('w.created_at <= ?');
      params.push(filter.createdBefore.getTime());
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY w.created_at DESC';

    if (filter?.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);

      if (filter.offset) {
        query += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as { data: string }[];

    return rows.map(row => this.deserialize<WorkflowState>(row.data));
  }

  async saveTask(task: TaskState): Promise<void> {
    this.ensureConnected();

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tasks (
        id, workflow_id, agent_name, complexity, status, priority,
        data, created_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      task.workflowId,
      task.agentName,
      task.complexity,
      task.status,
      task.priority,
      this.serialize(task),
      task.createdAt.getTime(),
      task.startedAt?.getTime() || null,
      task.completedAt?.getTime() || null
    );

    if (this.config.enableLogging) {
      this.logger.debug(`Saved task: ${task.id}`);
    }
  }

  async getTask(taskId: string): Promise<TaskState | null> {
    this.ensureConnected();

    const stmt = this.db.prepare('SELECT data FROM tasks WHERE id = ?');
    const row = stmt.get(taskId) as { data: string } | undefined;

    if (!row) {
      return null;
    }

    return this.deserialize<TaskState>(row.data);
  }

  async deleteTask(taskId: string): Promise<void> {
    this.ensureConnected();

    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    stmt.run(taskId);

    if (this.config.enableLogging) {
      this.logger.debug(`Deleted task: ${taskId}`);
    }
  }

  async listTasks(filter?: TaskFilter): Promise<TaskState[]> {
    this.ensureConnected();

    let query = 'SELECT data FROM tasks';
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter?.workflowId) {
      conditions.push('workflow_id = ?');
      params.push(filter.workflowId);
    }

    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    if (filter?.agentName) {
      conditions.push('agent_name = ?');
      params.push(filter.agentName);
    }

    if (filter?.priority !== undefined) {
      conditions.push('priority >= ?');
      params.push(filter.priority);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY priority DESC, created_at ASC';

    if (filter?.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);

      if (filter.offset) {
        query += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as { data: string }[];

    return rows.map(row => this.deserialize<TaskState>(row.data));
  }

  async saveAgent(agent: AgentState): Promise<void> {
    this.ensureConnected();

    const agentStmt = this.db.prepare(`
      INSERT OR REPLACE INTO agents (
        name, complexity, status, version, data, loaded_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const deleteCapStmt = this.db.prepare('DELETE FROM agent_capabilities WHERE agent_name = ?');
    const insertCapStmt = this.db.prepare('INSERT INTO agent_capabilities (agent_name, capability) VALUES (?, ?)');

    this.db.transaction(() => {
      agentStmt.run(
        agent.name,
        agent.complexity,
        agent.status,
        agent.version,
        this.serialize(agent),
        agent.loadedAt?.getTime() || null,
        agent.lastActiveAt?.getTime() || null
      );

      deleteCapStmt.run(agent.name);

      for (const capability of agent.capabilities) {
        insertCapStmt.run(agent.name, capability);
      }
    })();

    if (this.config.enableLogging) {
      this.logger.debug(`Saved agent: ${agent.name}`);
    }
  }

  async getAgent(agentName: string): Promise<AgentState | null> {
    this.ensureConnected();

    const stmt = this.db.prepare('SELECT data FROM agents WHERE name = ?');
    const row = stmt.get(agentName) as { data: string } | undefined;

    if (!row) {
      return null;
    }

    return this.deserialize<AgentState>(row.data);
  }

  async deleteAgent(agentName: string): Promise<void> {
    this.ensureConnected();

    const stmt = this.db.prepare('DELETE FROM agents WHERE name = ?');
    stmt.run(agentName);

    if (this.config.enableLogging) {
      this.logger.debug(`Deleted agent: ${agentName}`);
    }
  }

  async listAgents(filter?: AgentFilter): Promise<AgentState[]> {
    this.ensureConnected();

    let query = 'SELECT DISTINCT a.data FROM agents a';
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter?.capabilities && filter.capabilities.length > 0) {
      query += ' JOIN agent_capabilities ac ON a.name = ac.agent_name';
      conditions.push(`ac.capability IN (${filter.capabilities.map(() => '?').join(', ')})`);
      params.push(...filter.capabilities);
    }

    if (filter?.status) {
      conditions.push('a.status = ?');
      params.push(filter.status);
    }

    if (filter?.complexity) {
      conditions.push('a.complexity = ?');
      params.push(filter.complexity);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY a.name';

    if (filter?.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);

      if (filter.offset) {
        query += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as { data: string }[];

    return rows.map(row => this.deserialize<AgentState>(row.data));
  }

  async saveEvent(event: StateEvent): Promise<void> {
    this.ensureConnected();

    const stmt = this.db.prepare(`
      INSERT INTO events (
        id, type, correlation_id, workflow_id, task_id, agent_name, data, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.type,
      event.correlationId || null,
      event.metadata.workflowId || null,
      event.metadata.taskId || null,
      event.metadata.agentName || null,
      this.serialize(event),
      event.timestamp.getTime()
    );

    if (this.config.enableLogging) {
      this.logger.debug(`Saved event: ${event.id} (${event.type})`);
    }
  }

  async getEvents(filter?: EventFilter): Promise<StateEvent[]> {
    this.ensureConnected();

    let query = 'SELECT data FROM events';
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter?.type) {
      conditions.push('type = ?');
      params.push(filter.type);
    }

    if (filter?.correlationId) {
      conditions.push('correlation_id = ?');
      params.push(filter.correlationId);
    }

    if (filter?.workflowId) {
      conditions.push('workflow_id = ?');
      params.push(filter.workflowId);
    }

    if (filter?.taskId) {
      conditions.push('task_id = ?');
      params.push(filter.taskId);
    }

    if (filter?.agentName) {
      conditions.push('agent_name = ?');
      params.push(filter.agentName);
    }

    if (filter?.startTime) {
      conditions.push('timestamp >= ?');
      params.push(filter.startTime.getTime());
    }

    if (filter?.endTime) {
      conditions.push('timestamp <= ?');
      params.push(filter.endTime.getTime());
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp DESC';

    if (filter?.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);

      if (filter.offset) {
        query += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as { data: string }[];

    return rows.map(row => this.deserialize<StateEvent>(row.data));
  }

  async getEventCount(filter?: EventFilter): Promise<number> {
    this.ensureConnected();

    let query = 'SELECT COUNT(*) as count FROM events';
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter?.type) {
      conditions.push('type = ?');
      params.push(filter.type);
    }

    if (filter?.correlationId) {
      conditions.push('correlation_id = ?');
      params.push(filter.correlationId);
    }

    if (filter?.startTime) {
      conditions.push('timestamp >= ?');
      params.push(filter.startTime.getTime());
    }

    if (filter?.endTime) {
      conditions.push('timestamp <= ?');
      params.push(filter.endTime.getTime());
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    const stmt = this.db.prepare(query);
    const row = stmt.get(...params) as { count: number };

    return row.count;
  }

  async saveSnapshot(snapshot: StateSnapshot): Promise<void> {
    this.ensureConnected();

    const stmt = this.db.prepare(`
      INSERT INTO snapshots (
        id, version, data, reason, automated, compressed, checksum, size_bytes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      snapshot.id,
      snapshot.version,
      this.serialize(snapshot),
      snapshot.metadata.reason,
      snapshot.metadata.automated ? 1 : 0,
      snapshot.metadata.compressed ? 1 : 0,
      snapshot.metadata.checksum,
      snapshot.metadata.sizeBytes,
      snapshot.createdAt.getTime()
    );

    if (this.config.enableLogging) {
      this.logger.info(`Saved snapshot: ${snapshot.id} (version ${snapshot.version})`);
    }
  }

  async getSnapshot(snapshotId: string): Promise<StateSnapshot | null> {
    this.ensureConnected();

    const stmt = this.db.prepare('SELECT data FROM snapshots WHERE id = ?');
    const row = stmt.get(snapshotId) as { data: string } | undefined;

    if (!row) {
      return null;
    }

    return this.deserialize<StateSnapshot>(row.data);
  }

  async getLatestSnapshot(): Promise<StateSnapshot | null> {
    this.ensureConnected();

    const stmt = this.db.prepare('SELECT data FROM snapshots ORDER BY created_at DESC LIMIT 1');
    const row = stmt.get() as { data: string } | undefined;

    if (!row) {
      return null;
    }

    return this.deserialize<StateSnapshot>(row.data);
  }

  async listSnapshots(limit: number = 10): Promise<StateSnapshot[]> {
    this.ensureConnected();

    const stmt = this.db.prepare('SELECT data FROM snapshots ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(limit) as { data: string }[];

    return rows.map(row => this.deserialize<StateSnapshot>(row.data));
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    this.ensureConnected();

    const stmt = this.db.prepare('DELETE FROM snapshots WHERE id = ?');
    stmt.run(snapshotId);

    if (this.config.enableLogging) {
      this.logger.info(`Deleted snapshot: ${snapshotId}`);
    }
  }

  async transaction<T>(operations: () => Promise<T>): Promise<T> {
    this.ensureConnected();

    return this.db.transaction(async () => {
      return await operations();
    })() as Promise<T>;
  }

  async clear(): Promise<void> {
    this.ensureConnected();

    this.db.exec(`
      DELETE FROM events;
      DELETE FROM tasks;
      DELETE FROM workflow_tags;
      DELETE FROM workflows;
      DELETE FROM agent_capabilities;
      DELETE FROM agents;
      DELETE FROM snapshots;
    `);

    if (this.config.enableLogging) {
      this.logger.warn('Cleared all data from database');
    }
  }
}