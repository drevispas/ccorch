import { StateSnapshot, WorkflowState, TaskState, AgentState, StateEvent } from '../types';

export interface PersistenceAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  saveWorkflow(workflow: WorkflowState): Promise<void>;
  getWorkflow(workflowId: string): Promise<WorkflowState | null>;
  deleteWorkflow(workflowId: string): Promise<void>;
  listWorkflows(filter?: WorkflowFilter): Promise<WorkflowState[]>;

  saveTask(task: TaskState): Promise<void>;
  getTask(taskId: string): Promise<TaskState | null>;
  deleteTask(taskId: string): Promise<void>;
  listTasks(filter?: TaskFilter): Promise<TaskState[]>;

  saveAgent(agent: AgentState): Promise<void>;
  getAgent(agentName: string): Promise<AgentState | null>;
  deleteAgent(agentName: string): Promise<void>;
  listAgents(filter?: AgentFilter): Promise<AgentState[]>;

  saveEvent(event: StateEvent): Promise<void>;
  getEvents(filter?: EventFilter): Promise<StateEvent[]>;
  getEventCount(filter?: EventFilter): Promise<number>;

  saveSnapshot(snapshot: StateSnapshot): Promise<void>;
  getSnapshot(snapshotId: string): Promise<StateSnapshot | null>;
  getLatestSnapshot(): Promise<StateSnapshot | null>;
  listSnapshots(limit?: number): Promise<StateSnapshot[]>;
  deleteSnapshot(snapshotId: string): Promise<void>;

  transaction<T>(operations: () => Promise<T>): Promise<T>;
  clear(): Promise<void>;
}

export interface WorkflowFilter {
  status?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface TaskFilter {
  workflowId?: string;
  status?: string;
  agentName?: string;
  priority?: number;
  limit?: number;
  offset?: number;
}

export interface AgentFilter {
  status?: string;
  complexity?: string;
  capabilities?: string[];
  limit?: number;
  offset?: number;
}

export interface EventFilter {
  type?: string;
  correlationId?: string;
  workflowId?: string;
  taskId?: string;
  agentName?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

export abstract class BasePersistenceAdapter implements PersistenceAdapter {
  protected connected: boolean = false;

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  isConnected(): boolean {
    return this.connected;
  }

  protected ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Persistence adapter is not connected');
    }
  }

  abstract saveWorkflow(workflow: WorkflowState): Promise<void>;
  abstract getWorkflow(workflowId: string): Promise<WorkflowState | null>;
  abstract deleteWorkflow(workflowId: string): Promise<void>;
  abstract listWorkflows(filter?: WorkflowFilter): Promise<WorkflowState[]>;

  abstract saveTask(task: TaskState): Promise<void>;
  abstract getTask(taskId: string): Promise<TaskState | null>;
  abstract deleteTask(taskId: string): Promise<void>;
  abstract listTasks(filter?: TaskFilter): Promise<TaskState[]>;

  abstract saveAgent(agent: AgentState): Promise<void>;
  abstract getAgent(agentName: string): Promise<AgentState | null>;
  abstract deleteAgent(agentName: string): Promise<void>;
  abstract listAgents(filter?: AgentFilter): Promise<AgentState[]>;

  abstract saveEvent(event: StateEvent): Promise<void>;
  abstract getEvents(filter?: EventFilter): Promise<StateEvent[]>;
  abstract getEventCount(filter?: EventFilter): Promise<number>;

  abstract saveSnapshot(snapshot: StateSnapshot): Promise<void>;
  abstract getSnapshot(snapshotId: string): Promise<StateSnapshot | null>;
  abstract getLatestSnapshot(): Promise<StateSnapshot | null>;
  abstract listSnapshots(limit?: number): Promise<StateSnapshot[]>;
  abstract deleteSnapshot(snapshotId: string): Promise<void>;

  abstract transaction<T>(operations: () => Promise<T>): Promise<T>;
  abstract clear(): Promise<void>;

  protected serialize(data: any): string {
    return JSON.stringify(data, (key, value) => {
      if (value instanceof Map) {
        return {
          _type: 'Map',
          entries: Array.from(value.entries())
        };
      }
      if (value instanceof Set) {
        return {
          _type: 'Set',
          values: Array.from(value.values())
        };
      }
      if (value instanceof Date) {
        return {
          _type: 'Date',
          value: value.toISOString()
        };
      }
      return value;
    });
  }

  protected deserialize<T>(json: string): T {
    return JSON.parse(json, (key, value) => {
      if (value && typeof value === 'object') {
        if (value._type === 'Map') {
          return new Map(value.entries);
        }
        if (value._type === 'Set') {
          return new Set(value.values);
        }
        if (value._type === 'Date') {
          return new Date(value.value);
        }
      }
      return value;
    });
  }
}